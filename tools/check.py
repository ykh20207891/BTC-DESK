"""One command for the whole verification loop.

    python tools/check.py            lint + unit/integration tests (offline)
    python tools/check.py --live     ... plus a short smoke run against Bybit mainnet (public data only)
    python tools/check.py --watch    rerun automatically whenever a source file changes

Exit code is non-zero when anything fails, so it can gate commits and CI.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
PY = sys.executable


def run(title: str, cmd: list[str]) -> bool:
    print(f"\n=== {title}: {' '.join(cmd)}")
    t = time.time()
    r = subprocess.run(cmd, cwd=ROOT)
    print(f"--- {title}: {'ok' if r.returncode == 0 else 'FAILED'} ({time.time() - t:.1f}s)")
    return r.returncode == 0


async def live_smoke(seconds: int = 20) -> bool:
    """Boot the real engine on real data and assert the basics a running desk must satisfy."""
    sys.path.insert(0, str(ROOT))
    from backend.config import Settings
    from backend.engine import Engine

    s = Settings.load()
    s.mode = "paper"
    s.stage_pace_s = 0.2
    e = Engine(s)
    ok = True
    try:
        await e.start()
        await asyncio.sleep(seconds)
        snap = e.snapshot()
        checks = {
            "stream online": snap["online"],
            "1m candles loaded": len(e.candles_1m) >= 500,
            "15m candles loaded": len(e.candles_15m) >= 100,
            "ticker has mark price": snap["market"].get("mark", 0) > 0,
            "model priced": snap["model"].get("p_up") is not None,
            "analog ready": snap["analog"].get("ready", False),
            "health fresh": e.ws_age_s() < 15 and e.candle_age_s() < 180,
            "no engine errors": not any(x["key"] == "err" for x in list(e.log)[-50:] if x.get("key")),
        }
        for name, val in checks.items():
            print(f"  [{'ok' if val else 'FAIL'}] {name}")
            ok &= bool(val)
    finally:
        await e.stop()
    return ok


def snapshot_sources() -> dict[str, float]:
    out = {}
    for pat in ("backend/*.py", "tests/*.py", "tools/*.py", "run.py"):
        for p in ROOT.glob(pat):
            out[str(p)] = p.stat().st_mtime
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="also run a 20 s smoke test against Bybit mainnet")
    ap.add_argument("--watch", action="store_true", help="rerun on source changes")
    ap.add_argument("--no-lint", action="store_true")
    args = ap.parse_args()

    def once() -> int:
        results = []
        if not args.no_lint:
            results.append(run("ruff", [PY, "-m", "ruff", "check", "backend", "tools", "tests", "run.py"]))
        results.append(run("pytest", [PY, "-m", "pytest"]))
        if args.live:
            print("\n=== live smoke (Bybit mainnet, public data)")
            try:
                results.append(asyncio.run(live_smoke()))
            except Exception as e:  # report, never crash the loop
                print("  live smoke crashed:", e)
                results.append(False)
        print("\n" + ("ALL GREEN" if all(results) else "RED: fix the failures above and rerun"))
        return 0 if all(results) else 1

    if not args.watch:
        return once()
    seen = snapshot_sources()
    code = once()
    print("\nwatching for changes (Ctrl+C to stop)...")
    while True:
        time.sleep(1.5)
        now = snapshot_sources()
        if now != seen:
            seen = now
            code = once()
            print("\nwatching for changes (Ctrl+C to stop)...")
    return code


if __name__ == "__main__":
    sys.exit(main())
