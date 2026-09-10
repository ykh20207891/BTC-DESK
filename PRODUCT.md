# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Python 3 backend (FastAPI + uvicorn, httpx + websockets against the Bybit v5 API, SQLite ledger) serving a dependency-free static frontend (HTML/CSS/vanilla JS, Canvas 2D for the animated office floor and charts). Chosen because the engine must run 24/7 as one local process, the user asked for the best fit for the animated center scene, and a no-build frontend keeps the whole system runnable with `python -m uvicorn` alone.

## Users

The owner (a solo operator, Japanese-speaking) who wants a BTC-only automated trading desk on Bybit. They watch it on a desktop screen, often glancing rather than reading, and want to see what the system is doing, why, and how the book is performing, without trading by hand. Confirmed: single user, no team roles.

## Product Purpose

Automate an "UP or DOWN" BTC strategy on Bybit's BTCUSDT perpetual on a 15-minute horizon: detect signals, price the probability of an up/down move, compare it against the market, size the position, execute, settle, and repeat around the clock. Success is a system that runs unattended, keeps every decision visible, and respects hard risk limits.

## Positioning

A six-desk pipeline (Spotter → Prior → Edge → Kelly → Taker → Closer) where every ticket is routed through the same stages and every step is written to a visible log. The mechanism is transparency of the decision chain, not a black-box signal.

## Operating Context

- Exchange: Bybit v5 API (linear USDT perpetual, symbol BTCUSDT). API keys are available at any time (confirmed by the user) and are supplied through a local `.env`, never through the UI.
- Initial mode (confirmed): **Mainnet paper trading**. Real mainnet market data (public REST + WebSocket, no key required); orders are simulated against a virtual ledger with fees and slippage. Live execution is a configuration switch, off by default.
- Strategy (confirmed): 15-minute UP/DOWN judgement from a composite of RSI, EMA slope, VWAP distance, z-band position, volume, and a k-NN analog matcher; Kelly-based sizing; market execution; settlement at horizon or on stop/drawdown guard.
- Initial risk defaults (confirmed): max leverage 3×, 2% of equity risk per ticket, daily drawdown guard 4.2% (halts new tickets).
- Runs as one local Python process on the owner's Windows machine; UI opened in a browser on the same machine.

## Capabilities and Constraints

- Market data: 1m and 15m klines, tickers, order book, public trades for BTCUSDT.
- Pipeline: signal scan, probability model, edge vs market, Kelly sizing, execution (paper or live), settlement, activity log, equity history, ticket history.
- Controls: pause/resume swarm, switch paper/live (live requires keys and explicit confirmation), approval-only mode (human approves each ticket), edit risk limits.
- Persistence: SQLite ledger for tickets, fills, equity curve, and log.
- Constraint: no invented performance claims; all figures on screen come from the running ledger. Paper results are labelled as paper.
- Undecided: whether to add Telegram/LINE notifications; deployment to a VPS.

## Brand Commitments

- Binding visual reference (user: "見た目は添付した画像をもとに作成（忠実に）"): the two attached screenshots of a dark, dense, six-agent "desk" trading dashboard. Keep its layout, panel set, density, palette, per-agent colour coding, animated isometric office floor with a central core, and the desk/ticket vocabulary.
- The reference carries third-party branding ("GROK DESK", the Grok mascot, a handle). Those names and marks are not ours; the product ships under its own name, **BTC DESK**, with its own core mark, and no third-party handles.
- Desk vocabulary kept from the reference: SPOTTER, PRIOR, EDGE, KELLY, TAKER, CLOSER; "one book"; "the core routes every ticket"; edge quoted in cents (¢ = percentage points of probability).

## Evidence on Hand

- Two reference screenshots supplied in chat (not saved to the repo). No logos, no copy deck, no historical performance data. Any figures on screen at first run are the live ledger's or, before the first ticket, empty states.

## Product Principles

1. Every decision is legible: each ticket shows its stage, inputs, edge, size, fill, and settlement.
2. Risk limits are enforced by the engine, not by the operator's attention.
3. Paper first: the same code path runs paper and live; only the broker differs.
4. Glanceable at desk distance: state is readable from across the room, detail on approach.
5. Faithful to the reference look; honest about the data behind it.
