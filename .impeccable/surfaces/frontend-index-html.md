---
version: 1
slug: "frontend-index-html"
primary_target: "frontend/index.html"
related_targets: ["frontend/app.js","frontend/app.css","frontend/floor.js","frontend/charts.js","frontend/i18n.js"]
---

# Surface: frontend/index.html (BTC DESK dashboard)

Scope: the single operating screen of BTC DESK, a Bybit BTCUSDT paper/live trading desk. Visitor mode: **Operate**. The operator glances at it to know what the swarm is doing, why, and how the one book is performing; they intervene only to pause, approve, or change limits.

Audience and job: the owner, solo, desktop, dark room, evening. Task: confirm the system is alive and sane, read the current ticket's stage and edge, check PnL and drawdown, scan the activity log, occasionally pause or approve.

Content and proof: everything on screen is the live ledger (paper by default, labelled PAPER). Empty states before the first ticket. No invented performance.

Constraints: user-pinned look ("忠実に") from two reference screenshots: dark six-desk swarm dashboard with an animated isometric office floor and central core. Third-party names/marks in the reference are replaced (product name BTC DESK, own core mark). Desktop-first; mobile stacks panels.

## Direction contract

THESIS: One screen shows the whole decision chain as a working office: six desks, one book, the core routing every ticket. It refuses the category default of a chart with a sidebar of cards and a PnL number on top; the pipeline itself is the hero, the chart is one desk's instrument.

OWN-WORLD: Near-black ground (#06080d) with panels one step lighter and 1px hairline borders, no rounded-card softness. Six desk colours carry all state: Spotter green, Prior orange, Edge pink, Kelly violet, Taker blue, Closer red-orange; profit green and loss red are the only other hues. Small tracked uppercase labels, tabular numerals, a compact grotesque throughout. Panels headed by a rule with kicker-style title and a dotted "—" subtitle exactly as the reference (the reference's own header grammar is pinned, so the eyebrow ban yields here). Progress bars are 2px rules under each desk; tickets are tiny coloured cards.

STORY: The operator sees the swarm is online, which desk holds the ticket, what edge it found, how the book has moved, and what each agent just did. They believe the system is deliberate because every step is written down, and they act only on the pause/approve controls.

FIRST VIEWPORT (1440×900): top bar with product name, nav (FLOOR · TAPE · BOOK), cost stats, UTC clock, SWARM ONLINE control. Below it a one-line status strip and a scrolling ticker tape. Then the six desk cards in a row with stage labels and progress rules. Then THE OFFICE: a full-width animated canvas (isometric floor, central glowing core, six desks around it, agent orbs bobbing above their desks, ticket cards flying desk-to-desk along the route, mini monitors on each desk), flanked by a left column of six small gauges and a right column of small telemetry panels, with a MODEL VS BOOK overlay at top-right of the floor. Below the fold: SWARM PNL (big balance number, equity curve, win rate / avg edge / max DD), CANDLE ENGINE (1m candles, VWAP, z-bands, volume, RSI), ANALOG MATCHER (k-NN overlay chart with match stats), ACTIVITY LOG (per-agent step list). Primary action: the SWARM ONLINE / PAUSE control top right.

FORM: The brief-pinned reference world (six-desk swarm office floor) outranks the ordered list and the roll; seed key a38f3609, assigned index 5 acknowledged and yielded to the pin. Signature interaction: tickets routed across the office floor in sync with the real pipeline stage. Motion grammar: 150–250ms state transitions in the DOM; continuous but calm canvas motion (bobbing orbs, pulsing core, ticket flights) bounded to the floor canvas; no page-load choreography.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Adaptations from the reference (deliberate, cited)
- FIT/DARK toggle → FIT/WIDE (no light theme exists; WIDE releases the 1600px max width).
- Added: PAPER/LIVE mode chip (PRODUCT.md: paper results are labelled), EN/日本語 language toggle (user request 2026-09-10), DAY DD / GUARD readout (confirmed drawdown guard).
- Third-party name and mascot replaced by BTC DESK and its own core mark.
- User requests during the build: potted plants removed; routes to the core brightened then softened to rgba(190,210,245,0.42); floor rug is an ellipse, not a rhombus.
- Reference cost stats (HUMAN DESK/YR, SWARM RUN COST, CHEAPER) replaced by real UPTIME / HANDOFFS / SETTLED counts: no invented claims.

## Unresolved
- Notifications (Telegram/LINE) and VPS deployment are out of scope for this surface.
