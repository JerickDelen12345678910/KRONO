# DESIGN LOCK — do not deviate
Visual source of truth: `docs/design-preview.html`. Token values live ONLY in `src/styles/_design-tokens.scss`.

## Color discipline (calm, not rainbow)
- ONE accent: primary blue (`--pri`, tint `--pri-s`). Neutrals: slate (`--fit`, `--prj`), surfaces `--bg/--sf/--sf2`, text `--ink/--mu`, border `--bd`.
- Green (`--ok`) = success/synced/ready ONLY. Amber (`--warn`) = warning/needs review/overlap ONLY. Map uses primary.
- No other hues. No colored card top-borders. Light is the default theme; Dark must use the same tokens.

## Type & size
Manrope 400–700, tabular numbers. Page title 18/700 · card title 15/700 · body 14/500 · small 12/600 · KPI value 18/700. **No big headline numbers** (nothing above ~22px except the login title).

## Highlighting = light and shadow, not loud colors
- Normal cards: `--lift` (layered soft shadow). Key info only (max 1–2 per row): `--glow` + faint primary gradient (e.g., "Classes today", "Leave for …", streak).
- "Next up" card: dark ink surface with soft radial light top-right + `--glow`.

## Shape & spacing
8px grid · radius: chips/inputs 10, buttons 12, cards 16, mobile frame 36 · sections have a small muted label with a hairline.

## Layout
`>= 820px`: sidebar 240px + header with search + 2-column pages. `< 820px`: status bar + header + bottom nav (5 tabs: Home, Scheduler, Fitness, Map, Account) + stacked cards. KPI grid: 2 cols mobile → 4 cols desktop.

## Per-screen must-haves
Dashboard: KPI row, Next-up, quick actions, Today list, weekly line chart, sync card. Scheduler: Day/Week/Month/Year, filter chips, week strip + hourly timeline (8AM–6PM), overlap warning, "Upload COR" CTA. COR: 3-step stepper (Upload → Review → Create), privacy note, low-confidence row outlined amber. Fitness: KPI row, today's workout, category chips, weekly line chart, disclaimer. Map: search over map, route + alternatives, travel mode chips, "Needs internet", saved places (offline). Account: profile, edit form, sync pipeline (Saved locally → Waiting → Syncing → Synced), preferences toggles, Security (Sign out disabled offline).

## Accessibility
Focus ring `2px solid var(--pri)` offset 2px · aria-labels on charts · status never by color alone · respect `prefers-reduced-motion`.
