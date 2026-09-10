---
name: BTC DESK
description: A dark six-desk trading office where the pipeline itself is the hero and colour is state.
colors:
  ground: "#05070b"
  panel: "#090c12"
  panel-raised: "#0d1119"
  hairline: "#151b26"
  hairline-strong: "#1e2633"
  ink: "#e7ebf2"
  ink-muted: "#7d8798"
  ink-dim: "#4d5666"
  spotter-green: "#22c993"
  prior-orange: "#ff8a3d"
  edge-pink: "#ff4f8f"
  kelly-violet: "#9b6bff"
  taker-blue: "#4a8dff"
  closer-ember: "#ff5a3c"
  core-white: "#f4f7fb"
  core-ink: "#0b1220"
  core-label: "#c7cfdb"
  profit-green: "#22c55e"
  loss-red: "#ef4444"
  amber: "#f5b942"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontVariation: "wdth 100"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.02em"
    fontVariation: "wdth 100"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    lineHeight: 1.35
    letterSpacing: "0.06em"
    fontVariation: "wdth 100"
  stat:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.02em"
    fontVariation: "wdth 94"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "0.01em"
    fontVariation: "wdth 94"
    fontFeature: "tnum"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "9px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0.12em"
    fontVariation: "wdth 94"
  micro:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "8px"
    fontWeight: 800
    lineHeight: 1.35
    letterSpacing: "0.14em"
    fontVariation: "wdth 94"
rounded:
  none: "0"
  orb: "50%"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  gutter: "14px"
  bar: "22px"
components:
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "5px 10px"
  button-outline-hover:
    backgroundColor: "{colors.hairline-strong}"
    textColor: "{colors.ink}"
  button-ok:
    backgroundColor: "transparent"
    textColor: "{colors.profit-green}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "5px 10px"
  button-no:
    backgroundColor: "transparent"
    textColor: "{colors.loss-red}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "5px 10px"
  button-swarm:
    backgroundColor: "transparent"
    textColor: "{colors.spotter-green}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "6px 12px"
  button-swarm-paused:
    backgroundColor: "transparent"
    textColor: "{colors.amber}"
  chip-mode-paper:
    backgroundColor: "transparent"
    textColor: "{colors.amber}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "3px 7px"
  chip-mode-live:
    backgroundColor: "transparent"
    textColor: "{colors.loss-red}"
  chip-delta-up:
    backgroundColor: "rgba(34, 197, 94, 0.12)"
    textColor: "{colors.profit-green}"
    rounded: "{rounded.none}"
    padding: "2px 6px"
  chip-delta-down:
    backgroundColor: "rgba(239, 68, 68, 0.12)"
    textColor: "{colors.loss-red}"
    rounded: "{rounded.none}"
    padding: "2px 6px"
  toggle:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "4px 9px"
  toggle-on:
    backgroundColor: "{colors.hairline-strong}"
    textColor: "{colors.ink}"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    padding: "4px 0"
  nav-link-on:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  panel-header:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    height: "24px"
    padding: "0 10px"
  desk-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "96px"
    padding: "8px 12px 0"
  input-risk:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "5px 7px"
  log-row:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    padding: "4px 10px"
---

# Design System: BTC DESK

## Overview

**Creative North Star: "The Night Trading Floor"**

BTC DESK is one dark screen that shows a whole decision chain as a working office. The ground is near-black, panels sit one step lighter, and everything is separated by 1px hairlines rather than gaps, shadows, or rounded cards. Density is the point: the operator glances at it from across a dark room in the evening, so state is carried by colour and by very small, heavily tracked uppercase labels, with numbers set in tabular figures so columns hold still while they tick.

Six desk colours (Spotter green, Prior orange, Edge pink, Kelly violet, Taker blue, Closer ember) carry all pipeline state. Profit green, loss red, and amber are the only other hues; amber means "attention, not danger" (paper mode, paused, on deck). The glowing white core and its open-ring mark are the product's own identity. The one place the surface moves continuously is the isometric office floor canvas: orbs bob, the core pulses, tickets fly desk to desk; the DOM around it only transitions on state change.

The look is pinned to a user-supplied reference (PRODUCT.md, "忠実に"). Deliberate departures from that reference: the FIT/WIDE layout toggle replaces its FIT/DARK (there is no light theme and none is planned); a PAPER/LIVE mode chip and an EN/日本語 language toggle were added; third-party names and mascot are replaced by BTC DESK and the core mark; potted plants were removed, the desk-to-core routes were softened, and the floor rug is a single ellipse. The direction contract named the ground #06080d; the build shipped #05070b, and the build is normative.

**Key Characteristics:**
- Near-black ground, panels one step lighter, 1px hairline separation everywhere, zero radius on every rectangle
- Six desk colours carry pipeline state; green/red carry money; amber carries attention
- One compact variable grotesque (Archivo) at 94% width for everything, 100% width for the few big numbers and names
- 7–9px tracked uppercase labels above 11–34px bold tabular numerals
- Glow (box-shadow / canvas shadowBlur) is reserved for live dots, active desks, orbs and the core; it is a state signal, never decoration
- Continuous motion is bounded to the floor canvas; DOM transitions are 150–400ms and state-driven

## Colors

A near-black neutral ladder with six saturated desk hues and a strict three-colour money/attention set.

### Primary
- **Spotter Green** (`spotter-green`): desk 01. Also the "alive" colour: the live dot, the SWARM ONLINE control, and the footer status dot, because the Spotter is the first desk that proves the swarm is awake.
- **Prior Orange** (`prior-orange`): desk 02, probability pricing. Gauge, orb, monitor edge, log rows and tape entries for that desk.
- **Edge Pink** (`edge-pink`): desk 03. The drop-shaped desk icon; edge lines in charts.
- **Kelly Violet** (`kelly-violet`): desk 04, sizing. The drop-shaped desk icon; the MODEL CONFIDENCE bias bar.
- **Taker Blue** (`taker-blue`): desk 05, execution. Also the chart accent (VWAP line, z-band fill, trade labels), the BOOK PRESSURE bar, the focus ring and text selection: it is the "instrument" blue.
- **Closer Ember** (`closer-ember`): desk 06, settlement. Also the core's guard-state glow and the SWARM control when the drawdown guard has halted the desk.

### Secondary
- **Profit Green** (`profit-green`): any positive number (`.num.pos`, `.up`), the big PnL figure when above seed, the APPROVE / SAVE button outlines, delta chip tints at 12% alpha.
- **Loss Red** (`loss-red`): any negative number, the big PnL figure when below seed, the REJECT button, the LIVE mode chip, the offline dot, and the canvas offline message. Live mode is coloured as a warning on purpose.
- **Amber** (`amber`): attention without danger: PAPER mode chips, the paused swarm, ON DECK approvals, the warn dot, the NOW marker and median line in the analog chart.

### Tertiary
- **Core White** (`core-white`): the core orb and brand mark (radial white to `#b9c4d4`). **Core Ink** (`core-ink`) is the ring-and-lens mark cut into it (amber-dark `#a0741a` when paused, ember-dark `#7a2a1c` under guard). **Core Label** (`core-label`) is the CORE agent's colour in the log and tape.

### Neutral
- **Ground** (`ground`): page background, the office section, input fields, and the 85% scrim behind canvas name plates.
- **Panel** (`panel`): every panel, the top bar, tape, desk cards, footer, drawer; at 90–92% alpha with 4px blur for the MODEL VS BOOK and ON DECK overlays that float on the floor.
- **Panel Raised** (`panel-raised`): defined for a second lift; used sparingly (canvas and future overlays).
- **Hairline** (`hairline`): all borders and the 1px grid gaps between panels and desks; also the track of progress bars and the flat delta chip.
- **Hairline Strong** (`hairline-strong`): borders on interactive outlines (buttons, toggles, chips, inputs), the filled state of toggles, button hover fill, bias-bar tracks, scrollbar thumb.
- **Ink** (`ink`): primary text and the panel-header title square. **Ink Muted** (`ink-muted`): labels, subtitles, nav at rest, secondary numbers. **Ink Dim** (`ink-dim`): the quietest labels (desk stage numbers, micro captions, footer, empty states, chart axis text).

### Named Rules
**The Six Voices Rule.** A desk's colour is set once as `--c` on the desk card, gauge, orb, and log row, and every state cue (status dot, progress bar, monitor glow, running tint at 6% over panel, done word) reads from it. Never introduce a seventh pipeline hue.

**The Three Money Colours Rule.** Green means profit or approve, red means loss, reject, live, or offline, amber means paper, paused, or awaiting a human. No other hue may carry a financial or operational meaning.

**The Glow Is State Rule.** Glow appears only where something is live: dots (`0 0 6px`), active desk dots and bars (`0 0 6px var(--c)`), desk icons (`drop-shadow` at 55% of `--c`), and the canvas orbs and core. Resting surfaces never glow.

## Typography

**Display Font:** Archivo variable (self-hosted woff2, weight 100–900, width 62–125%), with system-ui, sans-serif
**Body Font:** Archivo variable at 94% width, with system-ui, sans-serif
**Japanese mode:** Archivo for Latin, then Yu Gothic UI, Meiryo, Hiragino Sans, Noto Sans JP; tracking on labels drops from 0.10–0.14em to 0.05em so kana do not fall apart

**Character:** One compact grotesque does everything. Body and labels are condensed to 94% width so the strip, tape, and 8px captions fit; names and big numbers open up to 100% width and 800 weight so they read from across the room. Tabular numerals are set globally.

### Hierarchy
- **Display** (800, 34px, line-height 1, -0.01em, width 100%): the single balance figure in SWARM PNL; coloured by profit/loss/flat.
- **Headline** (800, 20px, line-height 1, 0.02em, width 100%): the UTC clock.
- **Title** (800, 15px, 0.06em, width 100%): the six desk names; 13px on mobile. The brand wordmark is the same voice at 13px.
- **Stat** (800, 12–16px, line-height 1–1.1): gauge counts (16px), top-bar stats (14px), pnl stats and log amounts (13px), telemetry and analog stats (12px).
- **Body** (400–700, 11px, line-height 1.35, 0.01em, width 94%): risk inputs and notes; the base size of the page.
- **Label** (700–800, 9–10px, 0.10–0.12em, uppercase): panel-header titles and subtitles, nav, strip, buttons, chips, toggles, tape items, log rows (log rows relax to 0.04em).
- **Micro** (700–800, 7–8px, 0.12–0.14em, uppercase): desk stage and status lines, gauge and telemetry captions, pnl sub-lines, analog axis labels, footer. Canvas name plates use 6.5px at 0.16em; chart axes use 6–8px.

### Named Rules
**The Tracked Cap Rule.** Anything under 11px is uppercase and tracked at least 0.10em (0.05em in Japanese). Lowercase appears only in the tape and log free text and in the risk note.

**The Tabular Rule.** Every number sits in `tabular-nums`; sign and unit are part of the string (`+11.9¢`, `-$11.36`, `-0.61%`), never a separate glyph column.

## Layout

Full-bleed dashboard, desktop-first, no page padding. `body.fit` caps the page at 1600px centred; `body.wide` releases it (the FIT/WIDE toggle). Stacking order top to bottom: top bar (46px) → status strip (26px) → ticker tape (22px) → six desk cards (96px, `repeat(6, 1fr)` with 1px hairline gaps) → THE OFFICE (440px body: 84px gauge column · floor canvas · 96px telemetry column) → row A (`5fr 8fr`: SWARM PNL · CANDLE ENGINE, 300px) → row B (`7fr 6fr`: ANALOG MATCHER · ACTIVITY LOG, 300px) → footer (24px). Panel rows use a 1px `hairline` background and `gap: 1px` instead of borders so adjacent panels share a single line.

Spacing rhythm is tight and even: 1px separators; 3–4px between a label and its value; 6–8px inside cards and gauges; 10–12px panel padding; 14px horizontal gutter on bars; 22–26px between top-bar and strip groups. Panel header height is a fixed 24px.

Breakpoints, all `max-width`: 1300px (strip gap 22→12px), 1280px (top-bar and stat gaps tighten), 1180px (brand tagline hidden), 1080px (layout toggle hidden, lower rows go single column, office side columns shrink to 72/84px), 820px (top bar wraps, stats and clock hidden, desks go 2-up at 92px, office side columns become 3×2 grids of 132px above and below a 430px floor, MODEL VS BOOK docks under the floor as a 4-column strip without its sparkline, analog stats become a 5-up row, drawer goes full width).

## Elevation & Depth

Flat tonal layering. Depth is the two-step ladder ground → panel plus hairlines; there are no resting box-shadows on any card or panel. Two exceptions exist and are structural, not decorative: the risk drawer, which slides over the page (`-12px 0 30px rgba(0,0,0,0.5)`), and the floating floor overlays, which use a 90–92% panel scrim with 4px backdrop blur so canvas motion does not bleed through. Glow (see The Glow Is State Rule) is the only other shadow, and it means "live".

Inside the canvas, depth is drawn: an isometric grid at 13% blue-grey, one elliptical rug at 55% navy, a radial pit under the core, orbs casting soft black ellipses, and monitor edges glowing in the desk colour.

### Shadow Vocabulary
- **Live dot** (`box-shadow: 0 0 6px <colour>`): status dots, desk status dots, progress bars.
- **Signal glow** (`box-shadow: 0 0 8px currentColor`): the dot in the SWARM control.
- **Brand halo** (`box-shadow: 0 0 12px rgba(255,255,255,0.35)`): the core mark in the top bar only.
- **Drawer lift** (`box-shadow: -12px 0 30px rgba(0,0,0,0.5)`): the risk drawer only.

### Named Rules
**The Hairline Rule.** Surfaces meet on a 1px `hairline`; they are never separated by whitespace, shadow, or a change in radius.

## Shapes

Zero radius on every rectangle: panels, cards, buttons, chips, toggles, inputs, chart tags, and even the scrollbar thumb. The only round forms are circles that mean an agent or a signal: 5–6px status dots, the 30px desk icons (circles for Spotter, Prior, Taker, Closer; a drop for Edge and Kelly), the 16px brand mark, and the canvas orbs and core. Borders are 1px; interactive elements outline in `hairline-strong` and switch that outline to their state colour (green, red, amber, desk colour). The panel-header title is preceded by a 5px filled ink square. Progress is a 2px rule pinned to the bottom edge of a desk card; bias meters are 3px rules. Icons are stroked at 2.6px, round caps and joins, white on the desk colour, and the same six paths are drawn on the canvas orbs.

## Components

### Buttons
Small, outlined, tracked uppercase; colour of the outline says what the button will do.
- **Shape:** square corners (0), 1px outline.
- **Outline (`.btn`):** transparent on `hairline-strong`, ink text, 9px/800/0.12em, padding 5px 10px. Hover fills with `hairline-strong` (150ms). Disabled drops to 40% opacity.
- **OK / No:** the same button outlined and coloured in profit green (APPROVE, SAVE LIMITS) or loss red (REJECT); hover tints the fill at 12% alpha of the same colour.
- **Swarm control (`.swarm`):** the primary action. Outlined and coloured in Spotter green with a 6px glowing dot; padding 6px 12px. Paused → amber, guard → Closer ember, offline → loss red. Hover tints 10%.
- **Focus:** 1px `taker-blue` outline at 2px offset on every button, link, and input.

### Chips
- **Mode chip (PAPER / LIVE):** 9px/800/0.12em, padding 3px 7px, `hairline-strong` outline, amber text; LIVE turns text and outline loss red. The panel-header variant is 8px with 2px 6px padding.
- **Delta chip:** 10px/800, padding 2px 6px, green or red at 12% alpha with a leading ▲/▼/■ character; flat state uses `hairline` fill and muted ink.
- **Equity tag:** the same tint on the chart's right edge at 9px.

### Toggles
Segmented pairs (EN | 日本語, FIT | WIDE) inside one `hairline-strong` outline; each segment 9px/700/0.10em, padding 4px 9px, muted ink; the on segment fills `hairline-strong` and turns ink. 150ms.

### Cards / Containers
- **Panel:** `panel` background, 1px `hairline` border (dropped inside rows where the 1px grid gap draws the line), flex column, no radius, no shadow.
- **Panel header (pinned grammar):** 24px tall, 0 10px padding, hairline below. Left to right: 5px ink square · TITLE in ink 800 · "— subtitle · with · middots" in dim 600 (bold spans in muted) · right-aligned status cell in muted 700, which may be a chip or a close control. Every panel, the office, and the drawer use this exact header.
- **Desk card:** 96px, padding 8px 12px 0, three rows: stage line ("01 · SCAN" in dim micro, status dot + word right), icon + NAME + note, then state word + metric, with a 2px progress rule at the bottom. `run` state tints the card 6% with the desk colour, lights the dot and glows the bar; `on_deck` turns the status amber; `done` colours the state word.
- **Gauge / telemetry cells:** 6px 8px padding, hairline separated, a stat number with a micro caption and a sparkline canvas below.
- **Floating overlays (MODEL VS BOOK, ON DECK):** 92% panel scrim, 4px blur, `hairline-strong` outline (ON DECK outlines in amber).

### Inputs / Fields
- **Style:** `ground` fill on a `hairline-strong` outline, 11px/700 ink, right-aligned numerals, padding 5px 7px, square.
- **Hover:** outline lifts to `ink-dim`. **Focus:** the global 1px blue ring.
- **Message:** 8px tracked green confirmation, red on error, clears after 5s.

### Navigation
Top bar, 46px, panel background, hairline below. Brand mark + BTC DESK wordmark + muted tagline; then FLOOR · TAPE · BOOK links at 10px/700/0.12em in muted ink, hover to ink, active underlined with a 1px ink rule; then the mode chip. Right side: three stacked stats, the UTC clock, the two toggle groups, and the SWARM control. At 820px it wraps into two rows and hides the stats and clock. Below it, the status strip (26px, 9px tracked, key/value pairs with a live dot, one pressable pair for approvals) and the ticker tape (22px, 90s linear loop, fades at both ends, pauses on hover, stops under reduced motion).

### Activity log row
Five-column grid (5px dot · AGENT · ACTION · amount · text) at 9px, padding 4px 10px, hairline below, 250ms fade-and-drop entrance. The dot and agent name take the desk colour; the CORE agent uses core-label.

### The Office floor (signature)
Canvas 2D, DPR-aware, drawn in the same palette: an isometric grid, one elliptical rug, a radial pit, and six desks placed on an ellipse at fixed angles around a white core. Each desk carries an iso box body, a small chair, a monitor whose edge glows in the desk colour (16px blur when running, 6px at rest), a name plate (6.5px/800/0.16em on an 85% ground scrim, outlined in the desk colour when active), a 2px progress rule, and a bobbing orb (±4px, sine) bearing the same white stroked glyph as the desk card. Dashed grey routes (42% white-blue) run desk to core; the active holder's route brightens to its colour at 90% and 1.8px. The core is a white radial orb with a 44px glow (white; amber when paused; ember under guard) that breathes while routing, carrying the open-ring-and-lens mark. Tickets are 8px white cards with a 12px coloured glow that fly along the route. Reduced motion freezes bobbing.

## Do's and Don'ts

### Do:
- **Do** separate surfaces with a 1px `hairline` (or a 1px grid gap) and nothing else.
- **Do** set every desk-scoped element's colour through `--c` and let dots, bars, glows, and words inherit it.
- **Do** keep labels under 11px uppercase, 700–800 weight, tracked 0.10–0.14em (0.05em in Japanese).
- **Do** put every number in tabular figures with its sign and unit inline, coloured green/red by sign.
- **Do** use amber for paper, paused, and awaiting-approval states, red for live, loss, reject, and offline.
- **Do** keep continuous motion inside the floor canvas; DOM changes transition in 150–400ms and honour `prefers-reduced-motion`.
- **Do** head every panel with the pinned grammar: square · TITLE — subtitle · dots · right cell, 24px tall.

### Don't:
- **Don't** round any rectangle; only dots, orbs, icons, and the core are circular.
- **Don't** add resting box-shadows, gradients, or a second lift step to panels or cards; the drawer and the floor overlays are the only exceptions.
- **Don't** introduce a light theme or a seventh pipeline colour.
- **Don't** let type fall below 6px on canvas or 7px in the DOM, or drop the tracking on anything uppercase.
- **Don't** add page-load choreography or motion outside the office floor.
- **Don't** use third-party names, mascots, or handles; the core mark and BTC DESK are the only identity.
