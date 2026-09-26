# PainCave – gamification spec

Mockups: Claude Design canvas "PainCave UI Mockups", row **Gamification** (Badge system · Home – level card ·
Achievements · Ride summary – XP + new badges · Ride summary – level up, nothing unlocked).
Builds on `docs/design.md` (tokens, type, components). Anything not stated here follows that file.

Principles: **one currency** (XP = kJ), **few badge families**, everything **derived from saved rides**,
feedback is **compact** (one strip on the summary, one card on Home). No streaks, weekly goals, notifications,
sounds or confetti.

---

## 1. Rules

### 1.1 XP and level

- **XP of a ride = round(ride.kj)**. Only saved rides count; Discard grants nothing. No bonuses, no multipliers.
- Total XP = sum over all saved rides. Deleting a ride removes its XP (the level can go down; that's fine).
- **Cumulative XP to reach level n**: `xpFor(n) = n <= 2 ? 0 : round(400 · (n − 1)^1.5)`.
  Level 1 = no ride saved yet. The first saved ride always gives level 2 (whatever its kJ).
- No level cap. The title stays **Legend** from level 30 on.
- `levelFor(xp, rides) = rides === 0 ? 1 : max n ≥ 2 with xpFor(n) ≤ xp`.

```ts
export const TITLES = ['Rookie', 'Spinner', 'Grinder', 'Cave Dweller', 'Pain Seeker', 'Watt Machine', 'Legend'] as const
export const xpFor = (n: number) => (n <= 2 ? 0 : Math.round(400 * (n - 1) ** 1.5))
export const titleFor = (level: number) => TITLES[Math.min(6, Math.floor(level / 5))]
```

| Title | Levels | XP at first level | ≈ hours at 160 W avg (576 XP/h) |
|---|---|---|---|
| Rookie | 1–4 | 0 | – |
| Spinner | 5–9 | 3,200 | 5.6 |
| Grinder | 10–14 | 10,800 | 18.8 |
| Cave Dweller | 15–19 | 20,953 | 36 |
| Pain Seeker | 20–24 | 33,128 | 58 |
| Watt Machine | 25–29 | 47,030 | 82 |
| Legend | 30+ | 62,468 | 108 |

Other useful values: L2 0 · L3 1,131 · L4 2,078 · L8 7,408 · L9 9,051 · L11 12,649.
"About N min at 180 W" (Achievements) = `round(remainingXp / 648 · 60)` (180 W = 648 kJ/h).

### 1.2 Milestones (4 families × 5 tiers)

Cumulative totals over all saved rides. Tier i unlocks on the ride whose total first reaches the threshold
(replay rides by `startedAt`, then `id` – same order as `topBests`).

| Family | Total | Bronze | Silver | Gold | Platinum | Violet |
|---|---|---|---|---|---|---|
| Distance | Σ `distanceKm` (virtual, trainer speed) | 100 km | 500 km | 1,000 km | 2,500 km | 5,000 km |
| Time on the trainer | Σ `durationS` (moving time) | 10 h | 50 h | 100 h | 250 h | 500 h |
| Rides | count of rides with `durationS ≥ 300` | 10 | 50 | 100 | 250 | 500 |
| Pain | Σ (`zoneS[4] + zoneS[5]`) / 60 – minutes in HR Z4 + Z5 | 60 min | 300 min | 750 min | 1,500 min | 3,000 min |

Pain uses the current max HR (same as `rideAgg`). Changing max HR can move pain totals – accepted, everything
is re-derived. "Pain" is only this family; it is never shown as points or a second currency.

### 1.3 Records (repeatable, graphite badge, no tier)

- **Power best**: for each `BEST_DURATIONS` (5 s, 1 min, 5 min, 20 min), replaying rides in order, a ride whose
  best is **strictly higher** than the best of all earlier rides creates a record
  `{ kind: 'best', durationS, watts, prevWatts, rideId, date }`.
  The first ride that has a value for a duration only sets the baseline (no record) – "First ride" covers it.
  Label: `New best 5 min: 268 W` · sub `+4 W over 264 W`.
- **FTP raised**: whenever the FTP setting is saved higher than every FTP before it (baseline = FTP at the first
  ride, else `DEFAULT_FTP`). Not ride-bound, so it needs one stored list: settings key `ftpRecords`,
  JSON `[{ date, watts, prevWatts }]`, appended in `setFtp` when `watts > max`. Label `FTP raised to 214 W` · `from 205 W`.
  Lowering the FTP never creates or removes anything.
- Records are a history (newest first); all of them stay, a newer best doesn't delete older entries.
- They replace today's "New best · 5 s" chips in the summary title row (those go away).

### 1.4 Specials (one-off, graphite badge, no tier)

"Completed" = `!isIncomplete(ride)` (existing helper). `plan(t)` = target of the resolved `ride.blocks` at moving time t.
`offset(t) = sample.targetPower − plan(t)`.

| Special | Unlocks on the first saved ride that… | Hint text when locked |
|---|---|---|
| First ride | …exists | Save your first ride |
| First planned workout | …is planned and completed | Finish a ride from a workout |
| As planned | …is planned, completed, and `offset(t) ≥ −1` for every sample | Complete a workout without shifting below the plan |
| Harder than planned | …is planned, completed, `offset ≥ −1` always, and `offset ≥ +10` for ≥ 600 s in total | Complete a workout at +10 W or more for 10 min, never below the plan |
| Ramp test | …comes from a workout with category `Test` named "Ramp test" (fallback: `workoutName === 'Ramp test'`) and has ≥ 60 s with `targetPower ≥ ride.ftp` – completion not required, the test ends at failure | Ride the Ramp test past 100 % FTP |

The −1 W tolerance absorbs rounding. One ride can unlock both "As planned" and "Harder than planned".

### 1.5 Implementation shape (keep it derived)

- New `src/shared/gamification.ts`, pure, next to `stats.ts`:
  `achievements(aggs: RideAgg[], ftpRecords): Achievements` (level, XP, milestone totals + unlock dates,
  records, specials) and `gains(aggs, rideId)` = what that ride added (XP, level before/after, unlocked badges)
  – computed like `prs()`: replay with vs. without the ride.
- The summary shows gains *before* saving: call it with the unsaved ride included (the ride row already exists
  until Discard).
- `RideAgg` gets per-ride plan facts computed once from the samples at `finish` and stored on the ride row
  (one JSON column), so a replay never re-reads samples:
  `{ minOffset: number | null, plus10S: number, atFtpS: number }` (null = free ride).
- No achievements table. Ceiling: a replay over all rides per call – trivial for thousands of rides; cache the
  result in main and invalidate on ride save/delete/max-HR change if it ever shows up in a profile.

---

## 2. Badge artwork

### 2.1 Anatomy (viewBox `0 0 64 64`)

| Layer | Geometry | Paint |
|---|---|---|
| Rim | `HEX_OUTER` – pointy-top hexagon R 30, corner 6 | vertical gradient rimTop → rimBottom (reads as a bevel) |
| Face | `HEX_FACE` – R 25, corner 4.5 | vertical gradient faceTop → faceBottom, stroke `rgba(255,255,255,.28)` 1 |
| Inner ring | `HEX_RING` – R 21, corner 3.5 | Platinum: stroke `#8795A1` 1 · Violet: `rgba(255,255,255,.45)` 1 · others: none |
| Glyph | 24-grid glyph, `translate(18 16) scale(1.1667)` (records/specials: `translate(18 18)`) | fill none, stroke = ink, round caps + joins |
| Pips | tier count, `r 1.3`, cy 51, cx = 32 + (i − (tier−1)/2) · 4.5 | ink, opacity .75, only when size ≥ 48 and unlocked |
| Locked | `HEX_OUTER` fill `--input`, stroke `--border-strong` 2 · glyph stroke `--faint` · no face/ring/pips | |
| Progress (locked) | `HEX_OUTER` again, `pathLength="100"`, fill none, stroke tier **base** 3, `stroke-dasharray: p 100`, round caps; p = max(1, round(progress·100)), omitted at 0 | starts at 12 o'clock, runs clockwise |

Glyph stroke width (24-grid units): **2.5 at ≤ 32 px, 2.2 below 96 px, 2.0 at ≥ 96 px**.
Sizes in use: 96 (none yet – reserved), 48 (milestone grid), 40 (summary strip, specials), 32 (records list).

```ts
export const HEX_OUTER = 'M37.2 5L52.78 14Q57.98 17 57.98 23L57.98 41Q57.98 47 52.78 50L37.2 59Q32 62 26.8 59L11.22 50Q6.02 47 6.02 41L6.02 23Q6.02 17 11.22 14L26.8 5Q32 2 37.2 5Z'
export const HEX_FACE = 'M35.9 9.25L49.75 17.25Q53.65 19.5 53.65 24L53.65 40Q53.65 44.5 49.75 46.75L35.9 54.75Q32 57 28.1 54.75L14.25 46.75Q10.35 44.5 10.35 40L10.35 24Q10.35 19.5 14.25 17.25L28.1 9.25Q32 7 35.9 9.25Z'
export const HEX_RING = 'M35.03 12.75L47.16 19.75Q50.19 21.5 50.19 25L50.19 39Q50.19 42.5 47.16 44.25L35.03 51.25Q32 53 28.97 51.25L16.84 44.25Q13.81 42.5 13.81 39L13.81 25Q13.81 21.5 16.84 19.75L28.97 12.75Q32 11 35.03 12.75Z'
```

### 2.2 Tier palette

| Tier | rimTop | rimBottom | faceTop | faceBottom | ink (glyph, pips) | base (progress, swatch) |
|---|---|---|---|---|---|---|
| 1 Bronze | #7A4526 | #D99A6C | #E0A77B | #9C5F37 | #2B1608 | #C0804F |
| 2 Silver | #6B7079 | #DADDE2 | #EEF0F3 | #A3A8B0 | #1D2026 | #B9BEC6 |
| 3 Gold | #8C6A1C | #F0D78A | #F7E5A6 | #C39B3D | #3A2A05 | #DDBE68 |
| 4 Platinum | #7F8C97 | #FFFFFF | #FFFFFF | #C4CFD8 | #16202B | #E3E9EE |
| 5 Violet | #3A2B9C | #D3CBFF | #BCB0FF | #5847D8 | #FFFFFF | #8E7DFF |
| Graphite (records, specials) | #2D2D2A | #5E5C56 | #3A3935 | #232321 | #A99CFF | #8A877F |

Why these don't read as HR zones: zones are flat, saturated fills on pills/bars/tiles; tiers are always
two-tone gradients on a hexagon with a glyph. Bronze is a desaturated copper (not Z4 amber / Z5 red), gold is a
pale champagne, silver/platinum are cool and bright (Z1 is a warm mid grey). Rule: tier colours are **only**
used inside `<Badge>` and for the 4 px progress bar of the next locked tier – never as text, chart series or on
the Ride screen.

### 2.3 Glyphs (24 grid, stroke only)

| Family | Glyph |
|---|---|
| distance | road in perspective |
| time | stopwatch |
| rides | bike |
| pain | flame |
| record | bolt |
| special | star |

### 2.4 Component (copy as `src/renderer/src/components/Badge.tsx`)

```tsx
import { useId, type ReactNode } from 'react'
import { HEX_FACE, HEX_OUTER, HEX_RING } from './badgePaths' // the three constants from 2.1

export type BadgeFamily = 'distance' | 'time' | 'rides' | 'pain' | 'record' | 'special'
type Paint = { rimTop: string; rimBottom: string; faceTop: string; faceBottom: string; ink: string; base: string; ring?: string }

export const TIER_PAINT: Paint[] = [
  { rimTop: '#7A4526', rimBottom: '#D99A6C', faceTop: '#E0A77B', faceBottom: '#9C5F37', ink: '#2B1608', base: '#C0804F' },
  { rimTop: '#6B7079', rimBottom: '#DADDE2', faceTop: '#EEF0F3', faceBottom: '#A3A8B0', ink: '#1D2026', base: '#B9BEC6' },
  { rimTop: '#8C6A1C', rimBottom: '#F0D78A', faceTop: '#F7E5A6', faceBottom: '#C39B3D', ink: '#3A2A05', base: '#DDBE68' },
  { rimTop: '#7F8C97', rimBottom: '#FFFFFF', faceTop: '#FFFFFF', faceBottom: '#C4CFD8', ink: '#16202B', base: '#E3E9EE', ring: '#8795A1' },
  { rimTop: '#3A2B9C', rimBottom: '#D3CBFF', faceTop: '#BCB0FF', faceBottom: '#5847D8', ink: '#FFFFFF', base: '#8E7DFF', ring: 'rgba(255,255,255,0.45)' }
]
const GRAPHITE: Paint = { rimTop: '#2D2D2A', rimBottom: '#5E5C56', faceTop: '#3A3935', faceBottom: '#232321', ink: '#A99CFF', base: '#8A877F' }

export const GLYPHS: Record<BadgeFamily, ReactNode> = {
  distance: <path d="M4.5 20.5L9.5 3.5M19.5 20.5L14.5 3.5M12 4.5v2M12 10.5v3M12 17.5v3" />,
  time: <><circle cx="12" cy="13.5" r="7" /><path d="M12 13.5V10M9.5 3.5h5M12 3.5v3M18 7.5l1.5-1.5" /></>,
  rides: <><circle cx="5.5" cy="15.5" r="3.75" /><circle cx="18.5" cy="15.5" r="3.75" /><path d="M5.5 15.5L9.5 8.5H16M9.5 8.5L12 15.5H5.5M12 15.5L16 8.5L18.5 15.5M7.5 6.5h3.5M16 8.5l-.6-2.2h2.2" /></>,
  pain: <path d="M12 3.5c1 3.5 5.5 5.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-3 2-4.6 3-6.5.8 1.3 1.3 2.3 1.5 3.5.9-2.5 1-5 1-7.5z" />,
  record: <path d="M13.5 3L6 13.5h5.5L10.5 21 18 10.5h-5.5z" />,
  special: <path d="M12 4L14.29 9.44L20.18 9.94L15.71 13.81L17.05 19.56L12 16.5L6.95 19.56L8.29 13.81L3.82 9.94L9.71 9.44Z" />
}

export interface BadgeProps {
  family: BadgeFamily
  tier?: 1 | 2 | 3 | 4 | 5 // ignored for record / special
  locked?: boolean
  progress?: number // 0..1, locked only; 0 = no ring
  size?: number // px, square
  label: string // e.g. "Distance, Silver, 500 km, unlocked 26 Sep 2026" / "Distance, Gold, 505 of 1,000 km"
}

export function Badge({ family, tier = 1, locked = false, progress = 0, size = 48, label }: BadgeProps) {
  const id = useId()
  const tierless = family === 'record' || family === 'special'
  const p = tierless ? GRAPHITE : TIER_PAINT[tier - 1]
  const sw = size <= 32 ? 2.5 : size < 96 ? 2.2 : 2
  const glyph = (stroke: string) => (
    <g transform={`translate(18 ${tierless ? 18 : 16}) scale(1.1667)`} fill="none" stroke={stroke}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{GLYPHS[family]}</g>
  )
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={label} style={{ display: 'block', flex: 'none' }}>
      {locked ? (
        <>
          <path d={HEX_OUTER} fill="var(--input)" stroke="var(--border-strong)" strokeWidth={2} />
          {progress > 0 && (
            <path d={HEX_OUTER} pathLength={100} fill="none" stroke={p.base} strokeWidth={3} strokeLinecap="round"
              strokeDasharray={`${Math.max(1, Math.round(progress * 100))} 100`} />
          )}
          {glyph('var(--faint)')}
        </>
      ) : (
        <>
          <defs>
            <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.rimTop} /><stop offset="1" stopColor={p.rimBottom} /></linearGradient>
            <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.faceTop} /><stop offset="1" stopColor={p.faceBottom} /></linearGradient>
          </defs>
          <path d={HEX_OUTER} fill={`url(#${id}r)`} />
          <path d={HEX_FACE} fill={`url(#${id}f)`} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
          {p.ring && <path d={HEX_RING} fill="none" stroke={p.ring} strokeWidth={1} />}
          {glyph(p.ink)}
          {!tierless && size >= 48 && Array.from({ length: tier }, (_, i) => (
            <circle key={i} cx={32 + (i - (tier - 1) / 2) * 4.5} cy={51} r={1.3} fill={p.ink} opacity={0.75} />
          ))}
        </>
      )}
    </svg>
  )
}
```

`useId()` returns `:r0:`-style ids; they work in `url(#…)` in Chromium/Electron. If a lint rule complains, strip
the colons (`id.replace(/:/g, '')`).

### 2.5 Level emblem

Same `HEX_OUTER`, fill vertical gradient `#7C6BFF → #5040D0`, stroke `--accent-hi` 1.5. Number: Archivo 700,
`font-stretch: 75%`, tabular, white, font-size 30 (27 for ≥ 2 digits, 24 for 3 digits) in viewBox units,
`text-anchor: middle`, baseline y = 32 + 0.36 · font-size. Sizes: 96 (Achievements), 48 (level-up), 44 (Home), 36 (summary).
Level-up only: an extra `HEX_OUTER` behind it, stroke `rgba(169,156,255,.35)` 8, no fill (glow ring).
`aria-label="Level 8"`.

---

## 3. Components

All numbers tabular; XP numbers use thousands separators (`toLocaleString('en-US')`: 8,634).

### 3.1 XP progress bar
Track `--surface-3`, fill `--accent`, radius pill, `role="progressbar"` + `aria-valuenow`. Heights: Home 8, Achievements 10,
summary 6. Summary only: the XP gained in this ride is a second segment in `--accent-hi` right after the old fill
(level-up: the whole fill is the gained segment).

### 3.2 Milestone progress bar
112 × 4, track `--surface-3`, fill = tier **base** colour of the tier being worked on.

### 3.3 "New" chip
Existing badge style `accent` ("New"): marks what the **most recent saved ride** unlocked (milestone cells, specials).

---

## 4. Screens

### 4.1 Top bar
Tabs: **Home · Workouts · History · Progress · Achievements · Devices** (Achievements after Progress). Same tab style.
The post-ride Summary keeps its bar without tabs.

### 4.2 Home – level card
New first grid row, `grid-column: span 12`, height **72**. Home grid rows become `72px minmax(300px, auto) minmax(352px, auto)`,
page padding `32px 48px 28px` (so 1440 × 900 still fits without scrolling). Free ride / Workouts cards 300 high, Last ride / Devices 352.

Card = one button/link to Achievements (hover `--surface-2`, focus ring). `display:flex; align-items:center; gap:18px; padding:0 28px 0 16px`:
1. Emblem 44.
2. Block 150 wide: label "LEVEL 8" (label style, `--accent-hi`) over title 18 / 24 / 650.
3. Progress, `flex:1`, column gap 8: row (space-between, baseline) – left "417 XP to Level 9" 13 `--muted`; right "8,634" 17 / 600 condensed + " / 9,051 XP" 13 `--muted` · bar 8.
4. Divider 1 × 32 `--border`.
5. "Achievements ›" 14 / 600 `--accent-hi`.

`aria-label="Level 8, Spinner. 8,634 of 9,051 XP. Open achievements"`.
No rides yet: emblem "1", "Rookie", left text "Your first ride unlocks Level 2", right "0 XP", empty bar.

### 4.3 Achievements
Page padding 40 48, gap 24, scrolls (≈ 1,500 high at 1440 wide). Header: h1 "Achievements" + sub 15 `--text-2`
"Level 8 · 10 of 25 badges · 9 records" (25 = 20 milestones + 5 specials).

**Level card** (height 252, no padding on the card itself; two panes with a 1 px `--border` divider):
- Left pane 520 wide, padding 28 32, column gap 18:
  emblem 96 + (gap 22) label "LEVEL 8" `--accent-hi`, title 32 / 38 / 650, "8,634 XP total" 14 `--text-2`;
  progress row: left "417 XP to Level 9 · about 39 min at 180 W" 14 `--text-2`, right in-level "1,226" 17 / 600 condensed + " / 1,643" 13 `--muted`; bar 10;
  footnote 13 `--muted` with 16 px info icon `--accent-hi`: "1 kJ of work = 1 XP. Every saved ride counts, nothing else does."
- Right pane `flex:1`, padding 28 32: h2 "Titles" + right 13 `--muted` "A new title every 5 levels"; **title track** 124 high:
  7 nodes evenly spaced (node centres 106 px apart at 1440; label boxes 120 wide, centred), line 4 px radius 2 `--surface-3` at node centre height,
  fill `--accent` up to the current node + fraction `(xp − xpFor(currentTitleLevel)) / (xpFor(nextTitleLevel) − xpFor(currentTitleLevel))` of the next segment.
  Node = `HEX_OUTER` at 26 px – reached: fill `--accent`, stroke `--accent-hi`, white check (path `M22 33l7 7 13-15`, width 6); future: fill `--surface`, stroke `--border-strong`;
  current: 34 px, fill `--accent`, white dot r 8.
  Under each node (gap 6): title 14 / 600 (current 700 `--text`, reached `--text-2`, future `--muted`), "Level 10" 12 `--muted` (current: "You · Level 8" `--accent-hi`), "10,800 XP" 12 `--faint`.
  Title levels: Rookie 1, Spinner 5, Grinder 10, Cave Dweller 15, Pain Seeker 20, Watt Machine 25, Legend 30.

**Milestones card**: padding 24 32 12. Header h2 + right 13 `--muted` "6 of 20 · totals over all saved rides".
4 rows, 96 high, 1 px dividers, grid `250px repeat(5, minmax(0,1fr))`, gap 16:
- Left: name 16 / 600; total 26 condensed + unit 14 `--muted` ("505 km", "15.2 h", "24", "412 min"); note 12 `--muted`
  ("Virtual distance from trainer speed" · "Moving time, pauses excluded" · "Saved rides of 5 min or more" · "Minutes in heart-rate zones 4 + 5").
- Cells (gap 12): Badge 48 + column: threshold 15 / 600 ("1,000 km", "50 h", "50 rides", "750 min") + status:
  unlocked → date 13 `--muted` ("26 Sep", year omitted in the current year) + "New" chip if unlocked by the last ride;
  **next tier** → locked badge with progress ring, "505 / 1,000 km" 13 `--text-2` + milestone bar (gap 5);
  later tiers → locked badge without ring, threshold `--muted`, "Locked" 13 `--faint`.
Time total: one decimal below 100 h, integer above.

**Records card** (span 7) and **Specials card** (span 5), 12-col grid, gap 24; padding 24 28 8; header h2 + right meta 13 `--muted`.
- Records: rows 54, dividers; Badge record 32 · title 15 / 600 · sub 13 `--muted` · date 13 `--muted` right ("17 Sep 2026").
  Newest 7, then a 48 high footer with text button "Show all 9 ›" that expands in place.
  Empty: 15 `--text-2` "Records start with your second ride — beat any 5 s, 1 min, 5 min or 20 min best."
- Specials: rows 72; Badge special 40 (locked: outline, no ring) · name 15 / 600 (locked `--text-2`) + "New" chip · how-to 13 `--muted` · date right or "Locked" 13 `--faint`.
  Order fixed: First ride, First planned workout, As planned, Harder than planned, Ramp test.

Badge `label`s (a11y): "Distance, Silver, 500 km, unlocked 26 Sep 2026" / "Distance, Gold, locked, 505 of 1,000 km" / "Record, new best 5 min, 268 W".

### 4.4 Ride summary – "Earned in this ride" strip
Inserted between the header and the stats card. `<section aria-label="Earned in this ride">`, height **88**, `--surface`,
1 px `--border`, radius 14, padding 0 24, flex, `align-items:center`, gap 24. The chart card loses the 112 px (≈ 420 high at 900).
1. XP: "+260" 34 / 600 condensed `--accent-hi` + "XP" 15 / 600 `--accent-hi` (baseline, gap 6).
2. Level: emblem 36 + column 240 (gap 6): "Level 8 · Spinner" 15 / 600, bar 6 with gained segment, "417 XP to Level 9" 13 `--muted`.
3. Divider 1 × 44.
4. Label "NEW" (label style `--muted`), then up to **3** items, gap 28: Badge 40 + name 15 / 600 + sub 13 `--muted`:
   milestone "500 km" / "Distance · Silver"; special "Harder than planned" / "+20 W for 19 min, never below"; record "New best 5 min: 268 W" / "+4 W over 264 W".
   Order: records, milestones (higher tier first), specials. More than 3 → "+2 more" 14 / 600 `--text-2` (tooltip lists them).
   Nothing new → label "NEXT UP" + the locked next tier with the highest progress (Badge 40 with ring, "750 min" / "Pain · Gold · 706 / 750 min").
- **No link** to Achievements here: the summary must end with Save or Discard. Values are a preview; Discard grants nothing.
- **Level-up** (level after > level before): strip border `rgba(142,125,255,.55)`; the level block becomes a panel
  (height 60, radius 12, fill `--accent-soft`, padding 0 18 0 8, gap 14): emblem 48 with glow ring, "Level 10!" 22 / 26 / 650,
  sub 14 / 600 `--accent-hi` "New title · Grinder" when the title changed, else the title in `--text-2`. Bar (220 wide) + "1,733 XP to Level 11" follow the panel.
  Several levels in one ride: show only the final level.
  Motion, once on mount: emblem `scale(.85 → 1)` + glow opacity `0 → 1 → .35`, 600 ms ease-out; bar fill animates old → new, 800 ms.
  `prefers-reduced-motion: reduce` → no animation. No sound, no confetti, no modal.
- Title row: remove the "New best · …" chips (records live in the strip now).

### 4.5 Ride detail (from History)
Same strip without the level block and without animation: "+260 XP" · divider · "UNLOCKED" + what that ride unlocked,
or "Nothing unlocked" 14 `--muted`. (Level at that time isn't shown – it would change with later deletes.)

---

## 5. Out of scope
Streaks, weekly goals, challenges, leaderboards, sharing, notifications, sounds, XP for anything but kJ,
editing/awarding badges manually, per-special glyphs.
