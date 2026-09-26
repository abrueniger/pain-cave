# PainCave – V1 design spec

Mockups: Claude Design canvas "PainCave UI Mockups" (private), 17 artboards at 1440×900.
This file is the source of truth for the implementation (React + plain CSS + uPlot).

Direction: dark, warm-neutral ground; **one violet accent** (target / plan / primary actions);
heart-rate zone colours are reserved for HR and must never be used decoratively.
Numbers are condensed and tabular so they read from the saddle and don't jitter.

---

## 1. Tokens

```css
:root {
  color-scheme: dark;

  /* neutrals */
  --bg:            #111110;  /* app background */
  --surface:       #1A1A18;  /* cards, tiles, ride status bar */
  --surface-2:     #232321;  /* hover rows, secondary button, banner */
  --surface-3:     #2D2D2A;  /* chips, active segment, dragged row, paused banner */
  --input:         #141413;  /* input fill, thumbnail wells, table group rows */
  --border:        #2E2E2B;  /* card borders, dividers */
  --border-strong: #45443F;  /* input + secondary button borders */
  --text:          #F4F2EC;
  --text-2:        #B8B5AC;  /* secondary copy */
  --muted:         #8A877F;  /* labels, units, meta (4.8:1 on --surface) */
  --faint:         #6B6962;  /* disabled text, idle chevrons */

  /* accent (the only one) */
  --accent:        #6D5BF0;  /* primary fill, white text 4.8:1 */
  --accent-hover:  #7C6BFF;
  --accent-active: #5E4CE0;
  --accent-hi:     #A99CFF;  /* accent text/lines on dark: Target value, links, dashed target */
  --accent-line:   #8E7DFF;  /* plan profile top edge */
  --accent-soft:   rgba(109, 91, 240, 0.18); /* offset chip, icon wells */
  --focus-ring:    0 0 0 3px rgba(109, 91, 240, 0.35);

  /* semantic */
  --ok:          #3CCB7F;  /* connected, completed */
  --warn:        #F2B324;  /* searching, incomplete, unsaved */
  --danger:      #F0564A;  /* danger text/border, errors */
  --danger-fill: #C8322A;  /* solid confirm-delete button */
  --hr-line:     #FF6F91;  /* HR line + right axis labels */

  /* HR zones: base (dots, bars, chart) / tile fill / tile text */
  --z1: #8A8A84; --z1-bg: #3A3A36; --z1-fg: #F4F2EC;
  --z2: #3D8BFF; --z2-bg: #1F5FD1; --z2-fg: #FFFFFF;
  --z3: #2FBF71; --z3-bg: #18804A; --z3-fg: #FFFFFF;
  --z4: #F2B324; --z4-bg: #F2B324; --z4-fg: #1C1402;  /* amber tile uses dark text */
  --z5: #F04A3E; --z5-bg: #CF2F25; --z5-fg: #FFFFFF;

  /* chart */
  --chart-grid:        rgba(244, 242, 236, 0.07); /* horizontal; vertical 0.05; 0 W baseline 0.18 */
  --chart-plan:        rgba(109, 91, 240, 0.30);  /* upcoming plan fill (ride), 0.32 builder */
  --chart-plan-done:   rgba(109, 91, 240, 0.22);  /* summary/detail plan fill */
  --chart-ridden:      rgba(244, 242, 236, 0.07); /* plan fill left of "now" */
  --chart-unridden:    rgba(244, 242, 236, 0.04); /* incomplete ride: plan after end */

  /* shape + space */
  --r-sm: 6px;  --r-md: 8px;  --r-lg: 10px;  --r-xl: 12px;  --r-card: 14px;  --r-tile: 16px;  --r-pill: 999px;
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 20px; --s-6: 24px; --s-8: 32px; --s-10: 40px; --s-12: 48px;
  --shadow-pop: 0 24px 64px rgba(0, 0, 0, 0.6);   /* dialogs, start card */
  --shadow-drag: 0 18px 44px rgba(0, 0, 0, 0.6), 0 0 0 4px rgba(109, 91, 240, 0.18);
}
```

Zone thresholds (% of max HR, default 175): Z1 <60 (values below 50 % also render as Z1), Z2 60–70, Z3 70–80, Z4 80–90, Z5 ≥90.

## 2. Type

**Archivo** (Google Fonts, OFL), variable axes `wght 100–900` and `wdth 62–125`. Bundle the variable
woff2 locally (app works offline) – e.g. copy from `@fontsource-variable/archivo` (`wdth` build) into
`src/renderer/src/assets/fonts/` and declare one `@font-face` with `font-weight: 100 900; font-stretch: 62% 125%`.
Fallback stack: `'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif`.

Every number: `font-variant-numeric: tabular-nums`. Condensed numbers: `font-stretch: 75%`.
(Check once that Archivo's `tnum` feature is active in Electron – the timer must not wobble.)

| Token | Size / line | Weight | Extra | Use |
|---|---|---|---|---|
| display-xl | 88 / 0.95 | 600 | wdth 75, tnum, −0.01em | Ride Power, Target |
| display-l | 44 / 1 | 600 | wdth 75, tnum | HR, cadence, block left, elapsed |
| stat | 38 / 40 | 600 | wdth 75, tnum | Summary stats |
| stat-s | 26–30 / 30–34 | 600 | wdth 75, tnum | Total left, builder totals, home last-ride stats (28) |
| foot | 22 | 600 | wdth 75, tnum | Ride footer values |
| h1 | 28 / 34 (summary 30 / 36) | 650 | −0.01em | Page titles |
| h2 | 20 / 28 | 600 | | Card titles |
| body | 15 / 22 | 400 | | Default |
| small | 13 / 18 | 500 | | Meta, hints |
| label | 12 / 16 | 600 | uppercase, +0.08em | Column heads, stat labels |
| tile-label | 14 / 22 | 600 | uppercase, +0.08em | Ride tile labels |

Units next to big numbers: 24 px / 500 / `--muted` (after display-xl), 18 px after display-l, 14–16 px after stats; `font-stretch: 100%`, 10 px gap.
(Ride numbers are slightly above the 56–80 / 32–40 px brief because the condensed cut reads ~10 % smaller.)

## 3. Components

### Buttons
Base: `inline-flex; align-items:center; justify-content:center; gap:8px; font-weight:600; white-space:nowrap; border:1px solid`.

| Size | Height | Padding-x | Font | Radius | Icon |
|---|---|---|---|---|---|
| sm | 32 | 12 | 13 | 8 | 16 |
| md | 40 | 16 | 15 | 10 | 18 |
| lg | 48 | 20 | 16 | 12 | 20 |
| xl | 64 | 36 | 20 | 14 | 24 |

Icon-only: square (32/40/48), `aria-label` required.

| Variant | Background | Text | Border | Hover | Active |
|---|---|---|---|---|---|
| primary | `--accent` | #FFF | `--accent` | `--accent-hover` | `--accent-active` |
| secondary | `--surface-2` | `--text` | `--border-strong` | bg `--surface-3` | bg `--surface-3`, border `--muted` |
| danger | transparent | `--danger` | `rgba(240,86,74,.45)` | bg `rgba(240,86,74,.12)` | bg `rgba(240,86,74,.18)` |
| danger-solid (confirm) | `--danger-fill` | #FFF | `--danger-fill` | #D83A30 | #B02A23 |
| ghost | transparent | `--text-2` | transparent | bg `--surface-2`, text `--text` | bg `--surface-3` |
| disabled (any) | `--surface-2` | `--faint` | `--border` | none, `cursor:not-allowed` | – |

Focus (all interactive): `outline:none; box-shadow: var(--focus-ring)` on `:focus-visible`.
Icons: inline SVG, 24 viewBox, `stroke: currentColor; stroke-width: 1.9; round caps/joins`; play/pause/stop filled.

### Inputs
Height 40 (builder name 52 / 24 px / 650, transparent fill, `--border`), padding 0 12, radius 8, fill `--input`,
border 1px `--border-strong`, 15 px / 500, tabular. Focus: border `--accent` + `--focus-ring`.
Error: border `--danger` + `0 0 0 3px rgba(240,86,74,.22)`, `aria-invalid`, message below: 13 px / 500 `--danger`, alert icon 15 px, 6 px gap.
Labels: 13 px / 600 `--text-2`, 6 px above.
**Segmented control** (Steady | Ramp): wrapper fill `--input`, border `--border`, radius 10, padding 3, gap 2; options 32 high, padding 0 14, 14 px / 600, radius 7; active fill `--surface-3` text `--text`, inactive `--muted`. `role=radiogroup`.

### Cards & tiles
Card: fill `--surface`, 1px `--border`, radius 14. Padding 24 (home 24–28).
Ride tile: fill `--surface`, 1px `--border`, radius 16, padding 18 24; label row 22 high; value vertically centred.
HR tile: fill `--zN-bg`, border same colour, text `--zN-fg`; label/unit in fg at 78 % (Z4: `rgba(28,20,2,.72)`);
zone chip top-right (24 high, radius pill, 14 px / 700, bg fg-at-18 % / Z4 dark-at-14 %) "Z4 · 80 %";
bottom zone scale: 5 × 6 px bars, gap 4, fg colour, opacity current 1 / below .45 / above .18.
Colour transition on zone change: `background-color 400ms ease`.

### Lists / tables
- Workouts list: rows 104 high, padding 0 24, divider 1px `--border`; hover `--surface-2`; delete-confirm row tinted `rgba(240,86,74,.06)`.
- History table: CSS grid `210px 1fr 130px 130px 130px 130px 40px`, gap 16, padding 0 20 0 24; header 44 high (label style);
  month group row 36 high, fill `--input`, borders top+bottom; rows 56 high, whole row is a link, hover `--surface-2` + chevron `--text` (idle `--faint`).
  Numeric columns right-aligned: value 16 / 600 tabular + unit 13 / 500 `--muted`. Missing value "—" `--muted`.

### Status dots
8 px (ride bar 10 px) circle.
- connected: fill `--ok` + `0 0 0 3px rgba(60,203,127,.18)`
- searching: fill `--warn` + `0 0 0 3px rgba(242,179,36,.22)`, pulse opacity 1 → .4, 1.2 s infinite
- none/not paired: **hollow** 1.5px ring `--muted` (distinguishable without colour)
Always paired with a text label; `title="Trainer: Connected"`. Device pill (top bar): 34 high, padding 0 14, gap 16, fill `--surface`, border `--border`, radius pill, 13 px / 500 `--text-2`.

### Badges
22 high, padding 0 8, radius pill, 12 px / 600.
incomplete: `--warn` text, border `rgba(242,179,36,.45)`, fill `rgba(242,179,36,.08)` · completed: same recipe with `--ok` ·
neutral (Required/Optional/Paused): `--text-2`, border `--border-strong` · offset chip: `--accent-hi` on `--accent-soft`.

### Banners
- Info (devices hints): fill `--surface-2`, 1px `--border-strong`, radius 12, padding 16 20, gap 14, info icon 20 `--accent-hi`, title 15 / 600, lines `--text-2`.
- Paused (ride): 84 high, fill `--surface-3`, 1px `--border-strong`, radius 16, padding 0 16 0 24; 48 px round icon (fill `--text`, icon `--bg`); title 26 / 650; sub 14 `--text-2`.
- Warning card (no trainer): 44 px icon well `rgba(242,179,36,.14)`, alert icon `--warn`.

### Chart (uPlot)
| Element | Style |
|---|---|
| Power | `--text`, 2 px, linear, round joins |
| Heart rate | `--hr-line`, 1.75 px, scale `hr` 60–180, right axis (labels rose at 80 %, step 20) |
| Target (plan + offset), planned | `--accent-hi`, 2 px, `dash: [7, 5]`, only from *now* to end |
| Target, free ride | `--accent-hi`, 2 px solid, stepped (`uPlot.paths.stepped({align: 1})`) |
| Plan upcoming | fill `--chart-plan`, top edge `--accent-line` 1.5 px |
| Plan ridden (left of now) | fill `--chart-ridden`, no edge |
| Plan in summary/detail | fill `--chart-plan-done`, edge `rgba(142,125,255,.7)` 1.25 px |
| Incomplete ride remainder | fill `--chart-unridden`, edge `--faint` 1.25 px dash [4,4]; end marker `--warn` 1.5 px dash [4,4] + label "Ended 31:12" 12 px |
| Now marker | vertical 2 px `--text` (paused: `--text-2`) from plot top − 4; label chip 54×22, radius 6, fill `--text`, text `--bg` 13 / 700 |
| Grid | horizontal every 100 W `--chart-grid`, 0 W line .18; vertical every 5 min (≥45 min: 10 min, <20 min: 2 min) .05 |
| Axes | 12 px `--muted` tabular; left "300 W", bottom m:ss; plot padding L 56 / R 48 / T 30 (12 without now chip) / B 28 |
| Power scale | 0–350 W fixed (auto-extend to max(plan+offset, power)+50 when exceeded) |

Plan fills: two series built from the same step data (points duplicated at block edges); the "ridden" series is `null` after now,
the "upcoming" series `null` before now. Now marker + chip via a `draw` hook. Legend is HTML above the plot, right-aligned,
13 px / 500 `--text-2`, 18 px swatches, gap 20.

Mini profile thumbnail: plan only, no axes, fill `rgba(109,91,240,.55)` + 1.25 px `--accent-line` edge; in a well
(`--input`, 1px `--border`, radius 8, padding 6 8). Sizes: workouts 240×52, home 132×34.

### Drag handle & reorder
- Handle: 32×44 button, 6-dot grip (2×3, r 1.6, 6 px pitch), colour `--muted`, hover `--text-2` + fill `--surface-2`, `cursor: grab`; `aria-label="Drag to reorder"`.
- Dragging row: fill `--surface-3`, 1px `--accent`, `--shadow-drag`, handle `--accent-hi`, `cursor: grabbing`, follows pointer (≈ +16 px x offset).
- Source slot collapses; target slot opens a 62 px gap: fill `rgba(109,91,240,.07)`, 1.5 px dashed `--accent-line`, radius 12,
  plus a 3 px `--accent-hi` line on its top edge with an 11 px ring at the left end.
- Other rows animate `transform 150ms ease`. Numbers keep their old index until drop, then renumber.
- Keyboard: focus handle, `Alt+↑/↓` moves the block (replaces the old ↑ ↓ buttons). Pointer events, no DnD library.
- The dragged block is highlighted in the profile preview (fill `rgba(169,156,255,.62)`).

## 4. App frame

- Window content 1440×900 reference; layout is fluid ≥ 1280 wide.
- **Top bar** (all screens except Ride and post-ride Summary): 64 high, padding 0 32, gap 28, bottom border `--border`.
  Logo: 28 px rounded square (radius 8, `--accent`) with white 2.4 px step-line glyph + "PainCave" 19 / 700. Tabs Home · Workouts · History · Devices:
  36 high, padding 0 14, radius 8, 14 / 600; active fill `--surface-2` text `--text` + `aria-current`, idle `--text-2`. Device pill right.
- Page content: padding 40 48 (builder 28 48, summary 32 48), vertical gap 24.
- Post-ride Summary has the top bar **without tabs** (forces Save/Discard).

## 5. Screens

### Home
12-col grid, gap 24.
- Row 1 (316 high): **Free ride** card (span 5): label "FREE RIDE" `--accent-hi`, h 32 / 650 "Just ride", body `--text-2` (max 380 px), faint decorative step line bottom-right (accent-soft, 10 px stroke), primary **xl** "Start free ride". **Workouts** card (span 7): h2 + "All workouts ›" link; 3 most recent workouts, rows 74 high: thumbnail, name 16 / 600, meta "25:30 · 5 blocks · 100–300 W" 13 `--muted`, secondary md "Start".
- Row 2 (388 high): **Last ride** (span 8): label, name 20 / 600, date 13 `--muted`, "View ride ›"; compact chart (plan + power + HR, no axes) in an `--input` well, 120 high; 4 stats (Duration, Avg power, Avg HR, Energy) at 28 px condensed. Hidden when there are no rides.
  **Devices** (span 4): 3 rows 76 high: 40 px icon well, name 15 / 600, device name 13 `--muted`, status text + dot right (colour = state). Footer note "Paired devices reconnect automatically."
- States: no workouts → workouts card shows "No workouts yet" + "New workout"; trainer missing → Free ride Start disabled with 13 px `--warn` hint "Trainer not connected".

### Devices
- h1 + sub. Info banner "Before you pair" (close Wahoo/Zwift/Companion; wake devices).
- 3 slot cards (3-col, gap 24, 290 high): 48 px icon well (radius 12) + Required/Optional badge; title 18 / 600; device name 15 (none: "No device paired" `--muted`); status line (dot or 16 px spinner + text in state colour); hint 13 `--muted`; actions bottom:
  connected → secondary "Pair" + danger "Forget"; not paired → primary "Pair"; searching → secondary "Cancel".
  Controller hint: "Pair the left controller — it relays the right one. Without it, use ↑ ↓ on the keyboard."
  Controller error state (service missing): status `--danger` "Control service hidden", hint "Firmware newer than 1.2.0 is the likely cause."
- **Heart rate zones** card: left 260 px (h2, sub, "Max heart rate" input 96 wide + "bpm"); right 5-col grid: 8 px bar in `--zN`, "Z1" 15 / 700 + "50–60 %" 13 `--muted`, range "88–105 bpm". Ranges update live; save on blur/Enter; valid 100–230.
- **Pairing dialog** (Web Bluetooth chooser replaced by our list): backdrop `rgba(8,8,7,.72)`; dialog 560 wide, `--surface`, 1px `--border-strong`, radius 16, `--shadow-pop`.
  Header: 40 px accent-soft icon well, title 20 / 600, sub 13, ghost close. Search row (fill `--input`, borders top/bottom): spinner `--accent-hi`, "Searching for heart rate straps…", count right.
  Device rows 60 high, radius 10, hover `--surface-2`: signal bars icon (3 levels), name 15 / 600, "Heart Rate · Strong signal" 13 `--muted`, sm "Connect" (hover row primary, others secondary).
  Tip box (`--surface-2`, radius 10, 13 px). Footer ghost "Cancel". Empty after 10 s: keep spinner, show tip prominently.

### Workouts
- Header: h1 + "4 saved workouts" + primary lg "New workout" (+ icon).
- One card, list rows (see Lists): thumbnail 240×52, name 18 / 600, meta 14 `--muted`; actions right, gap 8: primary "Start", secondary "Edit", ghost "Duplicate", ghost icon trash in `--danger`.
- Delete → inline confirm in the row: "Delete this workout?" + ghost "Cancel" + danger-solid "Delete". No modal.
- **Empty**: 460 high box, 1.5 px dashed `--border-strong`, radius 16, centred: 160×64 profile glyph (accent-soft fill, accent-line edge), h2 22 "No workouts yet", body `--text-2`, primary lg "New workout", link "Or start a free ride".

### Workout builder
- Header row: 44 px back button (secondary style) · name input (520×52) · spacer · "TOTAL 25:30" and "BLOCKS 5" (label + 26 px condensed) · primary lg "Save" (min 120) with status under it: `--warn` 6 px dot "Unsaved changes" / nothing when saved / `--danger` "Fix 1 error to save" (Save disabled).
- Profile card: chart 168 high, W axis only (no HR axis), updates on every change.
- Block list: column heads (label style) `# · Type · Duration · Power`; grid `32px 28px 176px 124px 1fr 136px`, gap 16.
  Row: 62 high, `--surface`, 1px `--border`, radius 12, padding 8 12 8 8, gap 8 between rows: handle · index 15 / 600 `--muted` · segmented Steady|Ramp · duration input 100 (m:ss) · watts: steady `[88] W`, ramp `[88] → [88] W` · right: ghost icon Duplicate, ghost icon Delete.
- Error row: border `rgba(240,86,74,.5)`, input error style, message aligned under the duration input ("Seconds must be 0–59 — e.g. 12:45"). Total shows "—" `--muted`; chart keeps last valid profile.
- Footer: secondary "+ Steady", "+ Ramp", hint 13 `--muted` with defaults.
- Leaving with unsaved changes: confirm dialog (same shell as pairing dialog, 440 wide): "Discard changes?" · ghost "Keep editing" · danger "Discard".

### Ride (all states share this layout; no top bar)
- **Status bar** 72 high, fill `--surface`, bottom border. Left (250 px): device dots 10 px + label 13 / 600 (`--text-2`; non-connected label takes the state colour). Centre: planned → chip "Block 2/5" (26 high, `--surface-3`, 14 / 700) · "Steady 170 W" 20 / 650 · 1px divider · "next **0:30 @ 300 W**" 16 `--text-2`; free → chip "Free ride" · "Shift right ±10 W · left ±50 W". Right (250 px): lg buttons – secondary "Pause" + danger "End" (paused: primary "Resume" replaces Pause).
- Body padding 20 20 12, gap 16:
  1. Row 1, 2 cols, 196 high: **Power · 3 s** (value `--text`) · **Target** (value `--accent-hi`, "ERG" 12 / 700 `--accent-hi` top-right; planned: bottom line "plan 170" 18 `--text-2` + offset chip "+ 20" (28 high, radius 8, 17 / 700, `--accent-soft`/`--accent-hi`; offset 0 → `--surface-3`/`--muted`) + "Shift to adjust" 13 `--muted` right; free: "ERG · 50–1000 W").
  2. Row 2, 3 cols, 136 high: **Heart rate** (zone tile; no strap → neutral tile "—") · **Cadence** · **Block left** (value 44 + right "TOTAL LEFT" label + 30 px `--text-2`; bottom 6 px progress bar `--surface-3`/`--accent`) – free ride: **Elapsed**.
  3. Chart card (fills the rest, ~376 high): legend row 22 + plot. Planned: Power, Heart rate, Target (plan + offset), Plan, Ridden. Free: Power, Heart rate, Target; x-axis 0 → next full 5 min above elapsed, now marker at elapsed.
  4. Footer 44 high: AVG POWER · AVG HR · ENERGY · ELAPSED, label style + 22 px condensed value + unit, 1px × 20 dividers, gap 36.
- **Ready** (before Start): centre shows workout name 20 / 650 + "25:30 · 5 blocks"; right ghost "Back" + primary lg "Start". Tiles show live HR/cadence, Power "—" `--muted`, Target = first target, offset "+ 0". Chart shows the full plan as upcoming, now at 0:00. Start card centred over the chart (overlay `rgba(17,17,16,.55)`): 460 wide, `--surface-2`, radius 16, `--shadow-pop`, h 22 / 600 "Ready when you are", body, primary **xl** Start 280 wide.
  No trainer: trainer dot searching; both Start buttons disabled; card shows warning icon, "Trainer not connected", "Pedal once to wake the KICKR — it reconnects by itself. Start unlocks as soon as it's back.", link "Open Devices".
- **Paused**: paused banner (84 high) inserted above the tiles, chart shrinks. Auto: title "Paused – start pedaling to resume", sub "Auto-paused after 3 s without cadence · clock stopped · trainer at minimum". Manual: title "Paused", sub "Pedal or press Resume to continue · …". Power/Target/Cadence tiles at 55 % opacity; HR tile stays live; Block-left tile shows "Paused" badge; now marker `--text-2`.
- Connection lost mid-ride: status dot goes searching, its tile shows last value at 55 % opacity with "Reconnecting…" 13 `--warn` in the label row. No modal.
- Glanceability rules: nothing under 13 px on this screen; values never change width (tabular); no animations on numbers.

### Ride summary / ride detail (same component)
- Summary: slim top bar (no tabs). Header (88 high, bottom-aligned): label "RIDE SUMMARY" `--accent-hi`; h1 workout name (or "Free ride") + badge Completed / Incomplete; meta "Sat 26 Sep 2026 · 09:30–09:56 · planned workout" `--text-2`. Right: danger lg "Discard" + primary lg "Save ride" (min 150). Discard asks for confirmation (inline, same pattern as workouts).
- Detail (from history): top bar with History tab active; "‹ History" link instead of the label; right: danger lg "Delete ride" (confirm).
- Stats card: 7 equal columns with 1px dividers, padding 20 24: Duration · Avg power · Max power · Avg HR · Max HR · Avg cadence · Energy (label + 38 px condensed + unit). Missing HR → "—".
- Chart card fills the rest (~514 high): full ride, plan fill (planned) or target step line (free), power, HR; incomplete shows the unridden remainder + "Ended" marker. No now marker.

### History
- h1 + "8 rides". One card with the table (see Lists), newest first, grouped by month.
- Workout column: name 15 / 600, or step icon + "Free ride" 15 / 500 `--text-2`; "Incomplete" badge after the name (ride ended before the last block).
- Row click → detail. Empty state: same dashed box as Workouts, "No rides yet" + primary "Start free ride".

## 6. Out of scope for this design
Analytics, zone time-in-zone, settings beyond max HR, light theme, window sizes below 1280 × 800.
