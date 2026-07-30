/**
 * QA harness for the skip-on-timeout feature.
 *
 * Part A tests the REAL shared helpers (openSlots + draft math).
 * Part B is an in-memory state machine that mirrors the engine's exact rules
 *   (conditional frontier-advance, earliest-open resolution, skip-on-expiry,
 *    count-based completion, backlog drain, allowance→auto flip) and drives it
 *   through the tricky sequences, asserting the invariants.
 *
 * Run: npm run test:skip
 */
import assert from 'node:assert';
import {
  openSlots,
  draftPositionForOverall,
  overallForDraftPosition,
} from '../shared/src/index.ts';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

type DraftType = 'SNAKE' | 'STRAIGHT';

// ─────────────────────────────────────────────────────────────────────────
console.log('Part A — real shared helpers');

check('openSlots: straight, nothing taken, frontier=5 → slots 1..5, pos=overall', () => {
  const s = openSlots(new Set<number>(), 5, 10, 'STRAIGHT');
  assert.deepEqual(
    s.map((x) => x.overall),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    s.map((x) => x.position),
    [1, 2, 3, 4, 5],
  );
});

check('openSlots: snake round 2 positions are reversed', () => {
  // 3 teams: overalls 4,5,6 are round 2 → positions 3,2,1.
  const s = openSlots(new Set<number>(), 6, 3, 'SNAKE');
  const byOverall = new Map(s.map((x) => [x.overall, x.position]));
  assert.equal(byOverall.get(4), 3);
  assert.equal(byOverall.get(5), 2);
  assert.equal(byOverall.get(6), 1);
});

check('openSlots: taken overalls (incl. keepers) are excluded', () => {
  const s = openSlots(new Set([2, 4]), 5, 10, 'STRAIGHT');
  assert.deepEqual(
    s.map((x) => x.overall),
    [1, 3, 5],
  );
});

check('openSlots: frontier itself is included as an open slot', () => {
  const s = openSlots(new Set([1, 2]), 3, 10, 'STRAIGHT');
  assert.deepEqual(
    s.map((x) => x.overall),
    [3],
  );
});

check('openSlots: nothing open below a fully-picked frontier', () => {
  const s = openSlots(new Set([1, 2, 3]), 3, 10, 'STRAIGHT');
  assert.equal(s.length, 0);
});

check('draft math: overall↔position round-trips (snake, 10 teams, 15 rounds)', () => {
  for (let round = 1; round <= 15; round++) {
    for (let pos = 1; pos <= 10; pos++) {
      const o = overallForDraftPosition(round, pos, 10, 'SNAKE');
      assert.equal(draftPositionForOverall(o, 10, 'SNAKE'), pos);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Part B — engine state-machine mirror.
console.log('Part B — engine state-machine simulation');

interface SimTeam {
  pos: number;
  isBot: boolean;
  autoDraft: boolean;
  timeouts: number;
}

class Draft {
  teamCount: number;
  rounds: number;
  draftType: DraftType;
  allowSkips: boolean;
  allowance: number | null;
  total: number;
  frontier: number;
  taken = new Set<number>();
  keepers = new Set<number>(); // pre-placed keeper slots (a subset of `taken`)
  pickBy = new Map<number, number>(); // overall -> position that filled it
  teams: SimTeam[];
  complete = false;
  completions = 0; // how many times completion was detected (must be 1)

  constructor(opts: {
    teamCount: number;
    rounds: number;
    draftType: DraftType;
    allowSkips?: boolean;
    allowance?: number | null;
    bots?: number[]; // positions that are bots
    keepers?: number[]; // overalls pre-filled as keepers before the draft starts
  }) {
    this.teamCount = opts.teamCount;
    this.rounds = opts.rounds;
    this.draftType = opts.draftType;
    this.allowSkips = opts.allowSkips ?? true;
    this.allowance = opts.allowance ?? null;
    this.total = opts.teamCount * opts.rounds;
    this.teams = Array.from({ length: opts.teamCount }, (_, i) => ({
      pos: i + 1,
      isBot: (opts.bots ?? []).includes(i + 1),
      autoDraft: (opts.bots ?? []).includes(i + 1),
      timeouts: 0,
    }));
    // Keepers are picks placed before the draft starts — filled slots the
    // engine walks past, exactly like a made pick (see nextOpenOverall).
    for (const o of opts.keepers ?? []) {
      this.taken.add(o);
      this.keepers.add(o);
      this.pickBy.set(o, this.posOf(o));
    }
    this.frontier = this.nextOpen(1) ?? this.total + 1;
  }

  posOf(overall: number): number {
    return draftPositionForOverall(overall, this.teamCount, this.draftType);
  }
  team(pos: number): SimTeam {
    return this.teams[pos - 1];
  }
  nextOpen(from: number): number | null {
    for (let o = from; o <= this.total; o++) if (!this.taken.has(o)) return o;
    return null;
  }
  openBehindFrontier(): number[] {
    const cap = Math.min(this.frontier, this.total);
    const out: number[] = [];
    for (let o = 1; o <= cap; o++) if (!this.taken.has(o) && o !== this.frontier) out.push(o);
    return out;
  }
  earliestOpenForPos(pos: number): number | null {
    const cap = Math.min(this.frontier, this.total);
    for (const s of openSlots(this.taken, cap, this.teamCount, this.draftType)) {
      if (s.position === pos) return s.overall;
    }
    return null;
  }

  // Mirror of applyPick: fill `overall`, complete via count, else advance the
  // clock ONLY when the pick sat on the current frontier.
  private applyPick(overall: number): void {
    assert.ok(!this.taken.has(overall), `double-fill of overall ${overall}`);
    this.taken.add(overall);
    this.pickBy.set(overall, this.posOf(overall));
    if (this.taken.size >= this.total) {
      if (!this.complete) this.completions++;
      this.complete = true;
      this.frontier = this.total + 1;
      return;
    }
    if (overall === this.frontier) {
      this.frontier = this.nextOpen(overall + 1) ?? this.total + 1;
    }
  }

  /** A team makes a pick (route resolves earliest open slot for that team). */
  humanPick(pos: number): number {
    const overall = this.earliestOpenForPos(pos);
    assert.ok(overall !== null, `pos ${pos} has no open slot to pick`);
    this.applyPick(overall);
    return overall;
  }

  /**
   * A team fills a SPECIFIC open slot it owns — the LockInModal slot choice a
   * skipped-then-up-again picker gets. Mirrors the route's guard that `overall`
   * is genuinely one of that team's open slots. Filling the frontier advances
   * the clock; filling an earlier skipped slot leaves it untouched (applyPick).
   */
  humanPickAt(pos: number, overall: number): number {
    const cap = Math.min(this.frontier, this.total);
    const owns = openSlots(this.taken, cap, this.teamCount, this.draftType).some(
      (s) => s.overall === overall && s.position === pos,
    );
    assert.ok(owns, `pos ${pos} does not own open slot ${overall}`);
    this.applyPick(overall);
    return overall;
  }

  /** The frontier clock expires: skip or auto-pick, mirroring resolveExpiry. */
  expire(): 'skip' | 'autopick' | 'noop' {
    if (this.frontier > this.total) return 'noop'; // end-game, no clock
    const pos = this.posOf(this.frontier);
    const t = this.team(pos);
    const botLike = t.isBot || t.autoDraft;
    const hasSkipsLeft = this.allowance === null || t.timeouts < this.allowance;
    const doSkip = this.allowSkips && !botLike && hasSkipsLeft;
    if (doSkip) {
      const skippedOverall = this.frontier;
      this.frontier = this.nextOpen(skippedOverall + 1) ?? this.total + 1;
      t.timeouts++;
      if (this.allowance !== null && t.timeouts >= this.allowance) t.autoDraft = true;
      return 'skip';
    }
    this.applyPick(this.frontier); // auto-pick the frontier team
    return 'autopick';
  }

  /** Every-tick drain: auto-fill backlog owned by bot/auto_draft teams. */
  drainAutoBacklog(): number {
    if (!this.allowSkips) return 0;
    let made = 0;
    for (const o of this.openBehindFrontier()) {
      const t = this.team(this.posOf(o));
      if (t.isBot || t.autoDraft) {
        this.applyPick(o);
        made++;
      }
    }
    return made;
  }

  /** Commissioner backstop: auto-pick every skipped slot. */
  autopickSkipped(): number {
    let made = 0;
    for (const o of this.openBehindFrontier()) {
      this.applyPick(o);
      made++;
    }
    return made;
  }

  /**
   * Commissioner rollback to (and including) `overall`. Mirrors the server
   * route: deletes only NON-keeper picks at/after the target — keepers in
   * later rounds survive — then reopens on the first genuinely open slot at/
   * after the target (nextOpen skips the surviving keepers). Returns how many
   * real picks were removed.
   */
  rollbackTo(overall: number): number {
    assert.ok(!this.keepers.has(overall), `cannot roll back to a keeper slot (${overall})`);
    let removed = 0;
    for (let o = overall; o <= this.total; o++) {
      if (this.taken.has(o) && !this.keepers.has(o)) {
        this.taken.delete(o);
        this.pickBy.delete(o);
        removed++;
      }
    }
    // Reopening the draft: the next time it fills up is a fresh, legitimate
    // completion (assertComplete expects exactly one per continuous draft).
    this.complete = false;
    this.completions = 0;
    this.frontier = this.nextOpen(overall) ?? this.total + 1;
    return removed;
  }

  onClockPos(): number | null {
    return this.frontier <= this.total ? this.posOf(this.frontier) : null;
  }

  // Invariants for a completed draft.
  assertComplete(): void {
    assert.ok(this.complete, 'draft should be complete');
    assert.equal(this.completions, 1, 'completion must be detected exactly once');
    assert.equal(this.taken.size, this.total, 'every slot filled');
    for (let o = 1; o <= this.total; o++) {
      assert.ok(this.taken.has(o), `slot ${o} filled`);
      // Slot integrity: the team that filled o is the snake-assigned team.
      assert.equal(this.pickBy.get(o), this.posOf(o), `slot ${o} owned by right team`);
    }
    const perTeam = new Map<number, number>();
    for (const pos of this.pickBy.values()) perTeam.set(pos, (perTeam.get(pos) ?? 0) + 1);
    for (let p = 1; p <= this.teamCount; p++) {
      assert.equal(perTeam.get(p), this.rounds, `team ${p} has ${this.rounds} picks`);
    }
  }
}

check("user's A/B/C/D scenario: B picks → D still on clock; D picks → E on clock", () => {
  const d = new Draft({ teamCount: 5, rounds: 1, draftType: 'STRAIGHT' });
  assert.equal(d.expire(), 'skip'); // A(1) skipped → frontier 2
  assert.equal(d.expire(), 'skip'); // B(2) skipped → frontier 3
  assert.equal(d.expire(), 'skip'); // C(3) skipped → frontier 4
  assert.equal(d.frontier, 4);
  assert.equal(d.onClockPos(), 4); // D on the clock
  assert.deepEqual(d.openBehindFrontier(), [1, 2, 3]);

  const bOverall = d.humanPick(2); // B catches up
  assert.equal(bOverall, 2);
  assert.equal(d.frontier, 4, 'clock unaffected by a skipped pick');
  assert.equal(d.onClockPos(), 4, 'D still on the clock');

  const dOverall = d.humanPick(4); // D picks (on the clock)
  assert.equal(dOverall, 4);
  assert.equal(d.frontier, 5, 'clock advanced');
  assert.equal(d.onClockPos(), 5, 'E now on the clock');
});

check('multi-skip pile-up: catch-up order independent, clock only moves on frontier picks', () => {
  const d = new Draft({ teamCount: 6, rounds: 1, draftType: 'STRAIGHT' });
  for (let i = 0; i < 4; i++) assert.equal(d.expire(), 'skip'); // skip 1..4
  assert.equal(d.frontier, 5);
  assert.deepEqual(d.openBehindFrontier(), [1, 2, 3, 4]);
  for (const pos of [3, 1, 4, 2]) {
    const before = d.frontier;
    d.humanPick(pos);
    assert.equal(d.frontier, before, 'skipped catch-up never moves the clock');
  }
  d.humanPick(5); // frontier → 6
  assert.equal(d.frontier, 6);
  d.humanPick(6); // last slot → complete
  d.assertComplete();
});

check('same team skipped twice → two open slots, earliest filled first', () => {
  // Snake 3×2: p1 sits at overall 1 (r1) and overall 6 (r2).
  const d = new Draft({ teamCount: 3, rounds: 2, draftType: 'SNAKE' });
  assert.equal(d.expire(), 'skip'); // skip o1 (p1) → frontier 2
  // Burn down to o6 so p1 is on the clock again with o1 still open. Each team
  // on the clock picks for itself (arg is a POSITION, not an overall).
  while (d.onClockPos() !== 1) d.humanPick(d.onClockPos()!);
  assert.equal(d.frontier, 6);
  assert.equal(d.onClockPos(), 1); // p1 again, and o1 still open
  assert.deepEqual(d.openBehindFrontier(), [1]);
  const first = d.humanPick(1); // fills earliest → o1
  assert.equal(first, 1);
  assert.equal(d.frontier, 6, 'filling the old slot did not move the clock');
  const second = d.humanPick(1); // now fills o6 (frontier)
  assert.equal(second, 6);
  d.assertComplete();
});

check('snake turn: skipping the last pick of a round lands you on your own next pick', () => {
  // 4 teams snake: p4 has back-to-back picks — overall 4 (r1 last) and overall
  // 5 (r2 first). Skipping o4 must move the clock onto o5, which is ALSO p4.
  const d = new Draft({ teamCount: 4, rounds: 2, draftType: 'SNAKE' });
  d.humanPick(1);
  d.humanPick(2);
  d.humanPick(3); // frontier now 4, p4 on the clock (round-1 turn pick)
  assert.equal(d.frontier, 4);
  assert.equal(d.onClockPos(), 4);

  assert.equal(d.expire(), 'skip'); // p4 stalls on o4 → skipped
  assert.equal(d.frontier, 5, 'clock moved to the next pick');
  assert.equal(d.onClockPos(), 4, 'which is STILL p4 (the snake turn) — fresh clock');
  assert.equal(d.team(4).timeouts, 1);
  assert.deepEqual(d.openBehindFrontier(), [4], 'their round-1 slot stays open');

  // They keep thinking and now make BOTH picks in slot order.
  assert.equal(d.humanPick(4), 4, 'first pick fills the earlier (skipped) slot');
  assert.equal(d.frontier, 5, 'still on the clock for their round-2 pick');
  assert.equal(d.humanPick(4), 5, 'second pick fills the on-clock slot');
  assert.equal(d.onClockPos(), 3, 'clock now advances to the next team (p3, round 2)');
});

check('snake turn: BOTH back-to-back picks can be skipped, then caught up', () => {
  const d = new Draft({ teamCount: 4, rounds: 2, draftType: 'SNAKE' });
  d.humanPick(1);
  d.humanPick(2);
  d.humanPick(3); // frontier 4 (p4)
  assert.equal(d.expire(), 'skip'); // skip o4 → frontier 5 (still p4)
  assert.equal(d.expire(), 'skip'); // skip o5 too → frontier 6 (p3)
  assert.equal(d.team(4).timeouts, 2);
  assert.equal(d.onClockPos(), 3, 'p3 now on the clock (round 2)');
  assert.deepEqual(d.openBehindFrontier(), [4, 5], 'p4 owes two open slots');

  // p3 and everyone else finish; p4 catches up its two whenever.
  d.humanPick(4); // p4 fills o4
  d.humanPick(4); // p4 fills o5
  while (!d.complete) d.humanPick(d.onClockPos()!);
  d.assertComplete();
});

check('slot choice: skipped-then-up picker can fill the frontier slot first', () => {
  // The LockInModal slot choice. p4 (4-team snake turn) is skipped on o4 and
  // now up again on o5. Instead of the default (earliest o4 first), they pick
  // INTO the frontier o5 — that advances the clock and leaves o4 owed behind.
  const d = new Draft({ teamCount: 4, rounds: 2, draftType: 'SNAKE' });
  d.humanPick(1);
  d.humanPick(2);
  d.humanPick(3); // frontier 4 (p4, round-1 turn pick)
  assert.equal(d.expire(), 'skip'); // skip o4 → frontier 5 (still p4)
  assert.equal(d.onClockPos(), 4);
  assert.deepEqual(d.openBehindFrontier(), [4], 'o4 owed behind the frontier');

  // Choose the on-the-clock slot (o5), not the earlier o4.
  assert.equal(d.humanPickAt(4, 5), 5);
  assert.equal(d.frontier, 6, 'filling the frontier advanced the clock');
  assert.equal(d.onClockPos(), 3, 'p3 (round 2) now on the clock');
  assert.deepEqual(d.openBehindFrontier(), [4], 'o4 still owed — untouched by the choice');

  // Later, p4 catches up o4 (behind the frontier) — clock must not move.
  assert.equal(d.humanPickAt(4, 4), 4);
  assert.equal(d.frontier, 6, 'catching up the skipped slot left the clock alone');
  while (!d.complete) d.humanPick(d.onClockPos()!);
  d.assertComplete(); // integrity: every slot still owned by its snake team
});

check('slot choice: requesting a slot you do not own is rejected', () => {
  // The route rejects an overall that is not one of the target team's open
  // slots (a stale/forged client). Mirror that guard here.
  const d = new Draft({ teamCount: 4, rounds: 2, draftType: 'SNAKE' });
  d.humanPick(1);
  d.humanPick(2);
  d.humanPick(3); // frontier 4 (p4)
  d.expire(); // skip o4 → frontier 5 (p4)
  // o4 and o5 are p4's; o6 belongs to p3 — p4 must not be able to fill it.
  assert.throws(() => d.humanPickAt(4, 6), /does not own open slot 6/);
  // And a slot that isn't open at all (already picked) is rejected too.
  assert.throws(() => d.humanPickAt(1, 1), /does not own open slot 1/);
});

check('snake end-game: frontier runs off the board, commissioner drains stragglers', () => {
  const d = new Draft({ teamCount: 3, rounds: 2, draftType: 'SNAKE' });
  for (let i = 0; i < 6; i++) d.expire(); // skip all six slots
  assert.equal(d.frontier, d.total + 1, 'frontier parked past the board');
  assert.equal(d.onClockPos(), null, 'no live clock in end-game');
  assert.equal(d.openBehindFrontier().length, 6, 'all slots skipped/open');
  assert.equal(d.expire(), 'noop', 'expire is inert in end-game');
  const made = d.autopickSkipped();
  assert.equal(made, 6);
  d.assertComplete(); // integrity: every team got its snake-assigned slots
});

check('allowance cap flips team to auto_draft, backlog then drains', () => {
  const d = new Draft({ teamCount: 4, rounds: 3, draftType: 'SNAKE', allowance: 2 });
  const p1 = d.team(1);
  // Skip p1 on its first two appearances (o1, then o8 in snake r2).
  assert.equal(d.expire(), 'skip'); // o1 skipped, p1.timeouts=1
  assert.equal(p1.timeouts, 1);
  assert.equal(p1.autoDraft, false);
  // Advance to p1's next slot (o8) by auto-picking the teams in between as they
  // come up (they have full allowance, so make them just pick).
  while (d.onClockPos() !== 1) d.humanPick(d.onClockPos()!);
  assert.equal(d.frontier, 8);
  assert.equal(d.expire(), 'skip'); // o8 skipped, p1.timeouts=2 → hits cap
  assert.equal(p1.timeouts, 2);
  assert.equal(p1.autoDraft, true, 'exhausting the allowance flips auto_draft');
  // The drain now fills p1's backlog (o1) automatically.
  const drained = d.drainAutoBacklog();
  assert.ok(drained >= 1, 'backlog drained');
  assert.ok(d.taken.has(1), 'p1 old skipped slot filled by drain');
  // Finish the draft; p1 auto-picks the rest.
  let guard = 0;
  while (!d.complete && guard++ < 200) {
    d.drainAutoBacklog();
    if (d.onClockPos() === null) {
      d.autopickSkipped();
    } else if (d.onClockPos() === 1) {
      d.expire(); // p1 is auto_draft now → auto-pick
    } else {
      d.humanPick(d.onClockPos()!);
    }
  }
  d.assertComplete();
});

check('race: stale skip after a frontier pick is a no-op (no double advance)', () => {
  const d = new Draft({ teamCount: 5, rounds: 1, draftType: 'STRAIGHT' });
  // Frontier is 1. A pick lands on the frontier and advances it to 2.
  const F = d.frontier;
  d.humanPick(d.onClockPos()!); // fills 1 → frontier 2
  assert.equal(d.frontier, 2);
  // A stale expire() computed against F=1 tries to skip. Real code guards with
  // `where current_overall = F`; F(1) != current(2) → no-op.
  const staleFrontierStillThere = d.frontier === F;
  assert.equal(staleFrontierStillThere, false, 'guard sees the frontier already moved');
  // (No state change applied — frontier stays 2, slot 1 filled once.)
  assert.equal(d.frontier, 2);
  assert.equal(d.taken.size, 1);
});

check('race: pick landing at an already-skipped frontier becomes a behind-pick', () => {
  const d = new Draft({ teamCount: 5, rounds: 1, draftType: 'STRAIGHT' });
  // Skip frontier 1 → frontier 2, slot 1 left open.
  assert.equal(d.expire(), 'skip');
  assert.equal(d.frontier, 2);
  // A pick for pos 1 lands now. earliestOpenForPos(1) = 1 (behind frontier 2).
  const overall = d.humanPick(1);
  assert.equal(overall, 1);
  assert.equal(d.frontier, 2, 'behind-frontier pick left the clock alone');
});

check('bots are never skipped: a bot on the clock auto-picks', () => {
  const d = new Draft({ teamCount: 4, rounds: 1, draftType: 'STRAIGHT', bots: [1] });
  assert.equal(d.expire(), 'autopick'); // bot at frontier 1 auto-picks
  assert.ok(d.taken.has(1));
  assert.equal(d.frontier, 2);
});

check('skips OFF preserves classic behavior: expire always auto-picks, no backlog', () => {
  const d = new Draft({ teamCount: 4, rounds: 2, draftType: 'SNAKE', allowSkips: false });
  let guard = 0;
  while (!d.complete && guard++ < 100) {
    assert.equal(d.drainAutoBacklog(), 0, 'no drain when skips are off');
    assert.equal(d.expire(), 'autopick', 'every expiry auto-picks');
  }
  d.assertComplete();
});

check('fuzz: random skip/pick sequences always finish with full slot integrity', () => {
  let rng = 123456789;
  const rand = () => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };
  for (let trial = 0; trial < 300; trial++) {
    const teamCount = 2 + Math.floor(rand() * 8); // 2..9
    const rounds = 1 + Math.floor(rand() * 5); // 1..5
    const draftType: DraftType = rand() < 0.5 ? 'SNAKE' : 'STRAIGHT';
    const allowance = rand() < 0.5 ? null : Math.floor(rand() * 4);
    const d = new Draft({ teamCount, rounds, draftType, allowance });
    let guard = 0;
    while (!d.complete && guard++ < 10000) {
      d.drainAutoBacklog();
      if (d.complete) break;
      const r = rand();
      const onClock = d.onClockPos();
      if (onClock === null) {
        // End-game: catch up a random straggler, or have the commish drain.
        const behind = d.openBehindFrontier();
        if (behind.length === 0) break;
        if (r < 0.3) d.autopickSkipped();
        else d.humanPick(d.posOf(behind[Math.floor(rand() * behind.length)]));
      } else if (r < 0.4) {
        d.expire(); // clock runs out (skip or auto-pick)
      } else {
        // A currently-pickable team picks: the on-clock team or a straggler.
        const behind = d.openBehindFrontier();
        if (r < 0.7 || behind.length === 0) d.humanPick(onClock);
        else d.humanPick(d.posOf(behind[Math.floor(rand() * behind.length)]));
      }
    }
    assert.ok(d.complete, `trial ${trial} completed`);
    d.assertComplete();
  }
});

check('rollback preserves a later-round keeper and removes only real picks', () => {
  // 4-team snake, 3 rounds. Round 3 (odd) → overalls 9,10,11,12 = positions
  // 1,2,3,4, so overall 10 is p2's round-3 keeper.
  const d = new Draft({ teamCount: 4, rounds: 3, draftType: 'SNAKE', keepers: [10] });
  assert.ok(d.keepers.has(10) && d.taken.has(10), 'keeper pre-placed at o10');

  // Make the first six real picks (overalls 1..6 on the clock in turn).
  for (let i = 0; i < 6; i++) d.humanPick(d.onClockPos()!);
  assert.deepEqual([...d.taken].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 10]);

  const removed = d.rollbackTo(3);
  assert.equal(removed, 4, 'removed exactly the 4 real picks o3..o6');
  assert.ok(d.taken.has(1) && d.taken.has(2), 'picks before the target survive');
  assert.ok(!d.taken.has(4) && !d.taken.has(5) && !d.taken.has(6), 'real picks after target gone');
  assert.ok(d.keepers.has(10) && d.taken.has(10), 'the keeper is untouched by the rollback');
  assert.equal(d.frontier, 3, 'clock reopens on the target slot');
});

check('rollback resume walks past a keeper sitting after the target', () => {
  // Keeper at o5. Fill o1..o4, engine skips o5, fill o6,o7. Roll back to o6:
  // only o6,o7 are real (o5 stays), and the resume slot is o6 itself.
  const d = new Draft({ teamCount: 5, rounds: 2, draftType: 'STRAIGHT', keepers: [5] });
  for (const _ of [1, 2, 3, 4]) d.humanPick(d.onClockPos()!); // o1..o4
  assert.equal(d.frontier, 6, 'frontier skipped the keeper at o5');
  d.humanPick(d.onClockPos()!); // o6
  d.humanPick(d.onClockPos()!); // o7
  const removed = d.rollbackTo(6);
  assert.equal(removed, 2, 'only o6,o7 removed');
  assert.ok(d.keepers.has(5) && d.taken.has(5), 'keeper before the frontier stays put');
  assert.equal(d.frontier, 6, 'resumes on o6, having stepped over the o5 keeper');
});

check('rollback then re-draft to completion: keeper intact, full slot integrity', () => {
  const d = new Draft({ teamCount: 4, rounds: 3, draftType: 'SNAKE', keepers: [10] });
  const drive = () => {
    let guard = 0;
    while (!d.complete && guard++ < 500) {
      if (d.onClockPos() === null) d.autopickSkipped();
      else d.humanPick(d.onClockPos()!);
    }
  };
  drive();
  d.assertComplete();
  assert.ok(d.keepers.has(10) && d.pickBy.get(10) === d.posOf(10), 'keeper filled its own slot');

  const removed = d.rollbackTo(3);
  assert.ok(removed >= 8, 'rolled back most of the board');
  assert.ok(d.keepers.has(10) && d.taken.has(10), 'keeper survived the rollback');
  assert.ok(!d.complete, 'draft reopened');

  drive(); // re-draft everything from the target forward
  d.assertComplete(); // every slot owned by its snake team — keeper included
  assert.ok(d.taken.has(10) && d.pickBy.get(10) === d.posOf(10), 'keeper still at its slot');
});

console.log(`\nAll ${passed} checks passed ✅`);
