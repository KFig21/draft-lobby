# Custom emoji reactions

> Status: **shipped & in use.** Global (not league-scoped) image-based reactions, added
> alongside the built-in unicode set. First token: `:f:` (a "press F" keycap PNG). The
> add / retire / delete lifecycle below is fully built; user-submitted and league-scoped
> emojis are a *possible future feature* — **not built** (see §6 for the migration path).

## 1. Goal & constraints

Support custom **image** reactions that behave like the built-in unicode ones everywhere —
pick modal, draft chat, home feed, the "who reacted" list, all three draft-cell hover
popovers, chat reaction-event lines, notifications, and live toasts — while guaranteeing:

1. **History never breaks.** A reaction, once made, must keep rendering forever — even after
   the emoji is removed from the palette.
2. **No raw token ever leaks.** A `:name:` shortcode must never appear as literal text to a
   user, in any surface, under any state.
3. **Removal is cheap and reversible in spirit.** The owner can add a few emojis for a draft
   and take them away afterward without losing that draft's reaction history.

## 2. Why it's not trivial

The reaction system is otherwise **all unicode text, end to end**: one shared
`REACTION_EMOJIS` list is (a) a zod `z.enum` for server validation, (b) the DB `emoji` text
key, and (c) rendered inline as a character (`<span>{emoji}</span>`, `fillText(emoji)`). A
PNG has no character to store and can't be `fillText`'d.

The solution: a custom emoji rides that same plumbing as a **shortcode token** (`:name:`)
that also lives in `REACTION_EMOJIS`. Only the **render layer** differs, branching to draw an
`<img>`. No new column, no migration — the token is just another string in a text field.

## 3. The three-layer model

The crux of the design is that **"what you can add" and "what can be drawn" are different
sets**:

| Layer | Source | Contains |
|---|---|---|
| **Validation / storage** | shared `REACTION_EMOJIS` (zod enum + DB text key) | every token the server will accept + store |
| **Palette (addable)** | `addableReactionEmojis()` | built-in unicode + **non-retired** custom |
| **Render (displayable)** | `<Reaction>` | **any** manifest entry (retired or not) + a placeholder for deleted ones |

`sortReactionEmojis()` orders the full set (used for the existing-reactions display, filtered
to `count > 0`, so a pick that already has a retired emoji still lists it).
`addableReactionEmojis()` = the same order minus retired tokens (used for **every palette**).

## 4. Lifecycle

| Action | What you do | Effect on old drafts | Deploy needed |
|---|---|---|---|
| **Add** | manifest entry + PNG + token in shared `REACTION_EMOJIS` | — | shared + server rebuild/redeploy |
| **Retire** | `retired: true` in the manifest | **Nothing** — still renders from its kept asset; only drops from the palette | client only |
| **Delete** | remove the entry + PNG | Renders a neutral dashed **?** placeholder (`.reaction-img--missing`), never the raw `:name:` | client only |

**Retire is the preferred "remove after my draft" path** — it's lossless. Deletion (and the
placeholder) is only for when you genuinely want the image gone, and even then it degrades
gracefully.

Operational note: **adding** touches the shared enum, so it needs a shared+server redeploy.
**Retiring** is client-only. So batch all draft emojis into one add (one deploy), then retire
them individually afterward with no server work.

## 5. File map

- `client/src/lib/customEmojis.ts` — the manifest `CUSTOM_EMOJIS` (`{ src, label, retired? }`,
  keyed by token), plus `isCustomEmoji` / `isRetiredEmoji` / `isMissingCustomEmoji` /
  `isCustomTokenShape` / `reactionText`. **Full lifecycle docs live in this file's header.**
- `client/src/components/Reaction/Reaction.tsx` (+ `.scss`) — the single render helper: an
  `<img>` (sized `1em`, so it tracks the surrounding font-size) for a custom token, a bare
  unicode fragment otherwise, and a dashed muted placeholder for a deleted `:shortcode:`.
- `client/src/assets/emojis/*.png` — the source images (256×256, transparent, ~90% fill).
- `client/src/lib/reactions.ts` — `sortReactionEmojis` (display, incl. retired) vs
  `addableReactionEmojis` (palette, excludes retired).
- `shared/src/social.ts` — `REACTION_EMOJIS` (the token goes here for validation/storage).
- Render sites (all via `<Reaction>`): `PickModal`, `DraftChat` (chip, palette, and the
  reaction-event line), `HomePage` feed, `ReactorsModal` (rows + filter chips), the three
  draft-cell popovers (`PickCell` / `DefaultPickCell` / `BoldPickCell`),
  `NotificationsPage`, and `DraftBoardPage`'s live toast titles (which are `ReactNode`).

The board/grade **PNG export** (`lib/boardCanvas.ts`, `lib/canvasKit.ts`) only draws a `"!!"`
flag for reactions, not the glyph — so custom emojis need no work there.

## 6. Future: user-submitted / league-scoped emojis (not built)

Kept **global** for now (single user — league-scoping would be speculative complexity). When
runtime, user-submitted emojis are actually wanted, the migration is contained:

1. Move the manifest from a compile-time map to a **DB table + object storage** (e.g. Supabase
   storage) for the images.
2. `<Reaction>` **fetches** the registry instead of importing the map — the render seam and
   `1em` sizing don't change.
3. Relax reaction validation from the fixed `z.enum` to **"known unicode OR a `:shortcode:`
   that exists in the registry"** (optionally scoped by league). This is the one server-side
   change; the enum is the only true bottleneck today.

The token scheme (`:name:`) and the single `<Reaction>` render seam are already shaped for
this — nothing in §3–§4 needs re-thinking, only re-sourcing.
