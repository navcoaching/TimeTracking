# Design — وقتي (Waqti) · Nav Builds identity

A locked design system for this app. Every screen redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow. Source DNA: https://navbuilds.net (owner's own brand).

## Genre
editorial (technical-editorial: paper, dense ink, one sparse signal colour, no gradients, no glass)

## Macrostructure family
- App screens (dashboard, projects, project detail, sessions, settings): **Workbench** — hairline-bordered panels, display numerals, bottom tab bar. Varies only in panel composition.
- Print report (reports page in `@media print`): **Long Document** — brand masthead (N mark + `NAV BUILDS` wordmark, project, client, date) over a heavy ink rule, then stat row, pricing table, distributions, session table.
- Marketing pages: none in this project.

## Theme (Nav Builds)
Light:
- `--bg` (paper)        oklch(96% 0.003 120)   · #F2F3F1
- `--surface`           oklch(99% 0.002 120)
- `--surface-2`         oklch(93.5% 0.004 120)
- `--text` (ink)        oklch(17% 0.004 260)   · #111214
- `--muted`             oklch(48% 0.012 250)   · #5E636B
- `--border` (rule)     oklch(89% 0.004 120)   · #DEDFDB
- `--primary` (signal)  oklch(67% 0.22 35)     · #FF4A1C
- `--primary-strong`    oklch(53% 0.2 35)      · #C2350C (signal as text)
- `--success`           oklch(50% 0.12 155)    · #1F7A45
- `--danger`            oklch(48% 0.19 28)     · #B42318

Dark: ink becomes paper (`--bg` oklch(17%)), surfaces oklch(21–26%), text oklch(96%), signal lifted to oklch(74% 0.16 35) (#FF8A70 family), contrast on signal = ink.

Signal discipline: `--primary` appears on at most three things per viewport — the primary action (start / stop / FAB), the running-timer indicator, the headline money figure. Everything else is ink on paper. Charts are ink.

## Typography
- Display: Alexandria (variable), weight 800, `letter-spacing: 0`, `line-height: 1.3` — all headings, stat values, buttons.
- Body: IBM Plex Sans Arabic 400 (600 for emphasis).
- Mono: Geist Mono (variable) — timer clock, all `.num` figures, dates, wordmark `NAV BUILDS` with `letter-spacing: 0.18em`.
- No italic anywhere in headings. Latin wordmark is `dir="ltr"`.
- Fonts are self-hosted via Fontsource and precached by the service worker (offline-safe).

## Spacing
4-pt scale in px (4 / 8 / 12 / 16 / 22 / 32). Panels 14–16 px padding. Radius: panels 12 px, inputs 12 px, brand mark 7 px, buttons pill (999 px).

## Motion
- Easing `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`, `--dur-short: 180ms`.
- Only `transform` / `opacity` animate; sheets slide 30 px + fade; toasts slide; FAB repositions when the active-timer banner is shown.
- `prefers-reduced-motion`: honour by collapsing to opacity (to be added to styles when motion grows).

## Microinteractions stance
- Silent success: toasts only for completed writes, 3.2 s, ink background.
- Confirmation dialogs only for destructive actions (delete, wipe, replace import, discard timer).
- Active-timer banner persists on every screen except the owning project.
- `:focus-visible` ring = 3 px signal at 25 % mix, never animated.

## CTA voice
- Primary: pill, ink fill (`--text` on `--bg`) for navigation CTAs; signal fill for the single time-critical action (start / stop timer).
- Secondary: pill, transparent, 1 px ink border.
- Destructive: pill, danger-soft fill, danger text; solid danger only inside confirm dialogs.
- Copy: verb first, ≤ 3 words («بدء العمل», «إنهاء الجلسة», «مشروع جديد»).

## Per-page allowances
- App screens MUST NOT use enrichment (no illustrations, no decorative gradients). Function carries the screen.
- Print report: typography only; brand mark is the one graphic.

## What pages MUST share
- The N brand mark (28 px ink square, paper N stroke, signal dot) in every top bar and the report masthead.
- Paper / ink / signal tokens and the ≤ 3-signal-per-viewport rule.
- Alexandria / IBM Plex Sans Arabic / Geist Mono roles.
- Pill buttons, hairline panels, no shadows.
- Bottom tab bar as the only navigation.

## What pages MAY differ on
- Panel composition inside Workbench (stat grid, list, form sheet).
- Chart form (bars on dashboard, horizontal tracks in reports) — always ink.

## Exports

### tokens.css
```css
:root {
  --font-display: 'Alexandria Variable', 'IBM Plex Sans Arabic', system-ui, sans-serif;
  --font-body: 'IBM Plex Sans Arabic', 'Alexandria Variable', system-ui, sans-serif;
  --font-mono: 'Geist Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace;
  --bg: oklch(96% 0.003 120);
  --surface: oklch(99% 0.002 120);
  --surface-2: oklch(93.5% 0.004 120);
  --text: oklch(17% 0.004 260);
  --muted: oklch(48% 0.012 250);
  --border: oklch(89% 0.004 120);
  --primary: oklch(67% 0.22 35);
  --primary-strong: oklch(53% 0.2 35);
  --primary-contrast: oklch(99% 0.002 120);
  --primary-soft: oklch(94% 0.04 40);
  --success: oklch(50% 0.12 155);
  --danger: oklch(48% 0.19 28);
  --warning: oklch(55% 0.12 75);
  --radius: 12px; --radius-sm: 8px; --radius-pill: 999px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1); --dur-short: 180ms;
}
```
The live token block lives at the top of `src/styles.css`; keep both in sync.

### Tailwind v4 `@theme`
```css
@theme {
  --color-paper: oklch(96% 0.003 120);
  --color-ink: oklch(17% 0.004 260);
  --color-signal: oklch(67% 0.22 35);
  --color-line: oklch(89% 0.004 120);
  --font-display: "Alexandria Variable", sans-serif;
  --font-sans: "IBM Plex Sans Arabic", sans-serif;
  --font-mono: "Geist Mono Variable", monospace;
}
```

### DTCG `tokens.json`
```json
{
  "color": {
    "paper":  { "$value": "oklch(96% 0.003 120)", "$type": "color" },
    "ink":    { "$value": "oklch(17% 0.004 260)", "$type": "color" },
    "signal": { "$value": "oklch(67% 0.22 35)",   "$type": "color" },
    "line":   { "$value": "oklch(89% 0.004 120)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Alexandria Variable",  "$type": "fontFamily" },
    "body":    { "$value": "IBM Plex Sans Arabic", "$type": "fontFamily" },
    "mono":    { "$value": "Geist Mono Variable",  "$type": "fontFamily" }
  }
}
```

## Provenance
- Source: https://navbuilds.net (public site owned by the user; read via HTML/CSS on 2026-10-23).
- Exact values observed: paper #F2F3F1, ink #111214, line #DEDFDB, muted #5E636B, signal #FF4A1C / text #C2350C / hover #D93A10, ok #1F7A45, err #B42318; fonts Alexandria Variable (ar display), Bricolage Grotesque (en display, not used here), IBM Plex Sans Arabic, Geist, Geist Mono; radii 0.25–0.75rem; pill buttons.
