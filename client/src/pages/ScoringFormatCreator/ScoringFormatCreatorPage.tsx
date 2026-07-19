import {
  FOOTBALL_CATALOG,
  SCORING_PRESETS,
  createScoringFormatSchema,
  type ScoringPreset,
  type ScoringRuleValue,
  type ScoringRules,
  type StatCategory,
} from '@draft-lobby/shared';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { supabase } from '../../supabase';
import './ScoringFormatCreatorPage.scss';

// Per-category editor state — the intuitive framing shown in the UI.
type Field = {
  on: boolean;
  points: number;
  per: number;
  overrides: Record<string, number>;
};

export interface SavedScoringFormat {
  id: string;
  name: string;
  rules: ScoringRules;
}

function defaultsFor(): Record<string, Field> {
  const out: Record<string, Field> = {};
  for (const c of FOOTBALL_CATALOG) {
    const overrides: Record<string, number> = {};
    for (const pos of c.overridePositions ?? []) overrides[pos] = c.defaultPoints;
    out[c.key] = {
      on: c.defaultOn,
      points: c.defaultPoints,
      per: c.defaultPer ?? 1,
      overrides,
    };
  }
  return out;
}

const rulePoints = (v: ScoringRuleValue): number =>
  typeof v === 'number' ? v : v.points;

function fieldsFromRules(rules: Record<string, ScoringRuleValue>): Record<string, Field> {
  const out: Record<string, Field> = {};
  for (const c of FOOTBALL_CATALOG) {
    const v = rules[c.key];
    const on = v !== undefined;
    const points = on ? rulePoints(v) : c.defaultPoints;
    const per = on && typeof v === 'object' ? v.per : (c.defaultPer ?? 1);
    const overrides: Record<string, number> = {};
    for (const pos of c.overridePositions ?? []) {
      const ov = rules[`${c.key}.${pos}`];
      overrides[pos] = ov !== undefined ? rulePoints(ov) : points;
    }
    out[c.key] = { on, points, per, overrides };
  }
  return out;
}

function openGroupsFor(fields: Record<string, Field>): Set<string> {
  const open = new Set<string>();
  for (const c of FOOTBALL_CATALOG) if (fields[c.key]?.on) open.add(c.group);
  return open;
}

type RateStyle = 'whole' | 'decimal';
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function convertRateFraming(
  fields: Record<string, Field>,
  style: RateStyle,
): Record<string, Field> {
  const out = { ...fields };
  for (const c of FOOTBALL_CATALOG) {
    if (c.kind !== 'rate') continue;
    const f = out[c.key];
    if (!f) continue;
    const ppu = f.per ? f.points / f.per : 0;
    const per = style === 'decimal' ? 1 : (c.defaultPer ?? 1);
    out[c.key] = { ...f, per, points: round3(style === 'decimal' ? ppu : ppu * per) };
  }
  return out;
}

interface Props {
  embedded?: boolean;
  onSaved?: (format: SavedScoringFormat) => void;
}

export function ScoringFormatCreatorPage({ embedded = false, onSaved }: Props = {}) {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const editId = embedded ? undefined : params.id;
  const { session } = useAuth();
  const userId = session?.user.id;

  const [name, setName] = useState('');
  const [fields, setFields] = useState<Record<string, Field>>(() => defaultsFor());
  const [openGroups, setOpenGroups] = useState<Set<string>>(() =>
    openGroupsFor(defaultsFor()),
  );

  // Edit mode: hydrate the sheet from the saved format's rules.
  useEffect(() => {
    if (!editId) return;
    void supabase
      .from('scoring_formats')
      .select('name, rules')
      .eq('id', editId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setName(data.name);
        const f = fieldsFromRules(data.rules as Record<string, ScoringRuleValue>);
        setFields(f);
        setOpenGroups(openGroupsFor(f));
      });
  }, [editId]);
  const [startPreset, setStartPreset] = useState<string>('');
  const [rateStyle, setRateStyle] = useState<RateStyle>('whole');
  const [showAdvanced, setShowAdvanced] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group the catalog under section headers, preserving order.
  const groups = useMemo(() => {
    const map = new Map<string, StatCategory[]>();
    for (const c of FOOTBALL_CATALOG) {
      const arr = map.get(c.group) ?? [];
      arr.push(c);
      map.set(c.group, arr);
    }
    return [...map.entries()];
  }, []);

  const changeRateStyle = (next: RateStyle) => {
    if (next === rateStyle) return;
    setRateStyle(next);
    setFields((prev) => convertRateFraming(prev, next));
  };

  const changeStartPreset = (value: string) => {
    setStartPreset(value);
    const next = value
      ? fieldsFromRules(SCORING_PRESETS[value as ScoringPreset].rules)
      : defaultsFor();
    setFields(rateStyle === 'decimal' ? convertRateFraming(next, 'decimal') : next);
    setOpenGroups(openGroupsFor(next));
    setShowAdvanced(new Set());
  };

  const setField = (key: string, patch: Partial<Field>) =>
    setFields((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const setOverride = (key: string, pos: string, value: number) =>
    setFields((prev) => ({
      ...prev,
      [key]: { ...prev[key], overrides: { ...prev[key].overrides, [pos]: value } },
    }));

  const toggleGroup = (group: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  const toggleAdvanced = (group: string) =>
    setShowAdvanced((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  const enabledCount = Object.values(fields).filter((f) => f.on).length;
  const enabledInGroup = (cats: StatCategory[]) =>
    cats.filter((c) => fields[c.key]?.on).length;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const rules: Record<string, ScoringRuleValue> = {};
    const valueFor = (c: StatCategory, points: number): ScoringRuleValue =>
      c.kind === 'rate' ? { points, per: fields[c.key].per } : points;
    for (const c of FOOTBALL_CATALOG) {
      const f = fields[c.key];
      if (!f?.on) continue;
      rules[c.key] = valueFor(c, f.points);
      for (const pos of c.overridePositions ?? []) {
        if (f.overrides[pos] !== f.points) {
          rules[`${c.key}.${pos}`] = valueFor(c, f.overrides[pos]);
        }
      }
    }

    const parsed = createScoringFormatSchema.safeParse({ name, rules });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enable at least one category.');
      return;
    }

    setSaving(true);
    const values = { user_id: userId, name: parsed.data.name, rules: parsed.data.rules };
    const query = editId
      ? supabase.from('scoring_formats').update(values).eq('id', editId)
      : supabase.from('scoring_formats').insert(values);
    const { data, error } = await query.select('id, name, rules').single();
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    const saved = data as SavedScoringFormat;
    if (onSaved) onSaved(saved);
    else navigate('/settings');
  }

  const renderCat = (c: StatCategory, advOpen: boolean) => {
    const f = fields[c.key] ?? { on: false, points: 0, per: 1, overrides: {} };
    const id = `cat-${c.key}`;
    return (
      <div key={c.key} className={`scoring__cat${f.on ? '' : ' scoring__cat--off'}`}>
        <div className="scoring__cat-main">
          <input
            id={id}
            type="checkbox"
            className="scoring__check"
            checked={f.on}
            aria-label={c.label}
            onChange={(e) => setField(c.key, { on: e.target.checked })}
          />
          {c.kind === 'rate' && rateStyle === 'whole' ? (
            <span className="scoring__desc">
              Every{' '}
              <input
                className="scoring__per-input"
                type="number"
                min="1"
                step="1"
                value={f.per}
                disabled={!f.on}
                aria-label={`${c.label} per`}
                onChange={(e) => setField(c.key, { per: Number(e.target.value) })}
              />{' '}
              {c.label.toLowerCase()}
            </span>
          ) : (
            <label htmlFor={id} className="scoring__desc">
              {c.label}
            </label>
          )}
          {c.kind === 'rate' && rateStyle === 'decimal' ? (
            <span className="scoring__pts-unit">
              <input
                className="scoring__pts"
                type="number"
                step="0.001"
                value={f.points}
                disabled={!f.on}
                aria-label={`${c.label} points per ${c.unit}`}
                onChange={(e) => setField(c.key, { points: Number(e.target.value) })}
              />
              <span className="scoring__unit">/ {c.unit}</span>
            </span>
          ) : (
            <input
              className="scoring__pts"
              type="number"
              step="0.01"
              value={f.points}
              disabled={!f.on}
              aria-label={`${c.label} points`}
              onChange={(e) => setField(c.key, { points: Number(e.target.value) })}
            />
          )}
        </div>

        {advOpen &&
          f.on &&
          (c.overridePositions ?? []).map((pos) => (
            <div key={pos} className="scoring__cat-main scoring__cat-main--override">
              <span className="scoring__desc">
                {c.label} ({pos})
              </span>
              <input
                className="scoring__pts"
                type="number"
                step="0.01"
                value={f.overrides[pos] ?? f.points}
                aria-label={`${c.label} for ${pos}`}
                onChange={(e) => setOverride(c.key, pos, Number(e.target.value))}
              />
            </div>
          ))}
      </div>
    );
  };

  return (
    <div className="scoring">
      {!embedded && (
        <header className="scoring__page-header">
          <button className="back-link" onClick={() => navigate('/settings')}>
            ← Settings
          </button>
          <h1>{editId ? 'Edit scoring format' : 'New scoring format'}</h1>
        </header>
      )}
      <form className="scoring__form" onSubmit={save}>
        <label className="scoring__preset-label" htmlFor="scoring-name">
          Scoring format name
        </label>
        <input
          id="scoring-name"
          className="scoring__name"
          placeholder='e.g. "League One Scoring"'
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          required
        />

        <label className="scoring__preset-label" htmlFor="scoring-start-preset">
          Start from a preset
        </label>
        <select
          id="scoring-start-preset"
          className="scoring__preset"
          value={startPreset}
          onChange={(e) => changeStartPreset(e.target.value)}
        >
          <option value="">Blank (catalog defaults)</option>
          {(Object.keys(SCORING_PRESETS) as ScoringPreset[]).map((p) => (
            <option key={p} value={p}>
              {SCORING_PRESETS[p].label}
            </option>
          ))}
        </select>

        <div className="scoring__rate-style" role="group" aria-label="Rate scoring style">
          <span className="scoring__rate-style-label">Rate scoring</span>
          <button
            type="button"
            className={`scoring__rate-tab${rateStyle === 'whole' ? ' scoring__rate-tab--on' : ''}`}
            onClick={() => changeRateStyle('whole')}
          >
            Whole (1 per 25)
          </button>
          <button
            type="button"
            className={`scoring__rate-tab${rateStyle === 'decimal' ? ' scoring__rate-tab--on' : ''}`}
            onClick={() => changeRateStyle('decimal')}
          >
            Decimal (per unit)
          </button>
        </div>

        {groups.map(([group, cats]) => {
          const open = openGroups.has(group);
          const nOn = enabledInGroup(cats);
          const common = cats.filter((c) => !c.advanced);
          const advanced = cats.filter((c) => c.advanced);
          const forced = advanced.some((c) => fields[c.key]?.on);
          const advOpen = showAdvanced.has(group) || forced;
          return (
            <section key={group} className="scoring__group">
              <button
                type="button"
                className="scoring__group-toggle"
                aria-expanded={open}
                onClick={() => toggleGroup(group)}
              >
                <span className={`scoring__chevron${open ? ' scoring__chevron--open' : ''}`}>
                  ▸
                </span>
                <span className="scoring__group-title">{group}</span>
                {nOn > 0 && <span className="scoring__group-count">{nOn}</span>}
              </button>

              {open && (
                <div className="scoring__group-body">
                  {common.map((c) => renderCat(c, advOpen))}
                  {advanced.length > 0 && !advOpen && (
                    <button
                      type="button"
                      className="scoring__advanced-toggle"
                      onClick={() => toggleAdvanced(group)}
                    >
                      Show {advanced.length} advanced
                    </button>
                  )}
                  {advOpen && advanced.map((c) => renderCat(c, advOpen))}
                  {advOpen && !forced && (
                    <button
                      type="button"
                      className="scoring__advanced-toggle"
                      onClick={() => toggleAdvanced(group)}
                    >
                      Hide advanced
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {error && <p className="scoring__error">{error}</p>}

        <div className="scoring__footer">
          <span className="scoring__count">{enabledCount} categories</span>
          <button className="scoring__save" disabled={saving}>
            {saving ? 'Saving…' : editId ? 'Save changes' : 'Save format'}
          </button>
        </div>
      </form>
    </div>
  );
}
