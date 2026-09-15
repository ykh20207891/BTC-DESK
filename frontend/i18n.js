/* BTC DESK — UI strings in English (the pinned reference language) and Japanese. */
window.I18N = (() => {
  const EN = {
    brand_tag: "SIX AGENTS · ONE OFFICE FLOOR · BTC 15M",
    nav_floor: "FLOOR", nav_tape: "TAPE", nav_book: "BOOK",
    st_uptime: "UPTIME", st_handoffs: "HANDOFFS", st_settled: "SETTLED",
    tg_fit: "FIT", tg_wide: "WIDE",
    si_live: "AGENTS LIVE", si_lost: "STREAM LOST", si_holder: "HOLDER", si_hpm: "HANDOFFS/MIN", si_fair: "MODEL FAIR", si_vs: "VS MARKET",
    si_edge: "EDGE", si_open: "OPEN", si_tickets: "TICKETS", si_human: "HUMAN INPUT", si_approvals: "APPROVALS ONLY",
    si_away: "SETTLED WHILE YOU SLEPT", si_dd: "DAY DD", si_guard: "GUARD",
    office_title: "THE OFFICE", office_sub: "— SIX DESKS · ONE BOOK · THE CORE ROUTES EVERY TICKET",
    mvb_title: "MODEL VS BOOK", mvb_fair: "FAIR", mvb_book: "BOOK", mvb_edge: "EDGE", mvb_stake: "STAKE",
    deck_lbl: "ON DECK", approve: "APPROVE", reject: "REJECT",
    pnl_title: "SWARM PNL", pnl_sub1: "— ONE BOOK · BALANCE HISTORY ·", pnl_running: "RUNNING",
    roi: "ROI", on: "ON", seed: "SEED", win_rate: "WIN RATE", avg_edge: "AVG EDGE", max_dd: "MAX DD",
    bias_dir: "DIRECTIONAL BIAS", bias_conf: "MODEL CONFIDENCE", bias_book: "BOOK PRESSURE",
    candle_title: "CANDLE ENGINE", candle_sub: "— BTC 1M · VWAP · Z-BANDS · LIVE BOOK",
    analog_title: "ANALOG MATCHER", analog_sub: "— K-NN · SEEN THIS BEFORE",
    an_hist: "HISTORY · 48 BARS · Z-SCORED", an_now: "NOW", an_next: "WHAT HAPPENED NEXT",
    an_match: "MATCH", an_up: "UP", an_down: "DOWN", an_median: "MEDIAN", an_horizon: "HORIZON",
    log_title: "ACTIVITY LOG", log_sub: "— SIX AGENTS · EVERY STEP",
    foot_route: "SIX DESKS · ONE BOOK · THE CORE ROUTES EVERY TICKET", foot_venue: "BYBIT · BTCUSDT · LINEAR PERPETUAL",
    risk_title: "RISK LIMITS", risk_sub: "— ENFORCED BY THE ENGINE",
    r_lev: "MAX LEVERAGE", r_risk: "RISK / TICKET", r_dd: "DAILY DD GUARD", r_kelly: "KELLY FRACTION", r_edge: "MIN EDGE ¢",
    r_open: "MAX OPEN", r_hor: "HORIZON BARS", r_sl: "STOP LOSS", r_tp: "TAKE PROFIT", r_save: "SAVE LIMITS", r_scan: "CUT A TICKET NOW",
    r_note: "Mode switches (paper ↔ live) need API keys in .env and an engine restart.",
    tele_book: "BOOK · 50 LVL", tele_funding: "FUNDING", tele_spread: "SPREAD", tele_oi: "OPEN INTEREST", tele_basis: "MARK − INDEX", tele_atr: "ATR 15M",
    stage_spotter: "SCAN", stage_prior: "PRICING", stage_edge: "EDGE", stage_kelly: "SIZING", stage_taker: "EXECUTION", stage_closer: "SETTLEMENT",
    state_idle: "IDLE", state_run: "RUN", state_done: "DONE", state_on_deck: "ON DECK", state_holding: "HOLDING",
    working: "WORKING THE BOOK · STAGE {n} · {stage}", paused_open: "SWARM PAUSED · OPEN TICKETS STILL SETTLE",
    guard_closed: "DRAWDOWN GUARD · DESK CLOSED UNTIL 00:00 UTC", idle_next: "IDLE · NEXT SCAN {t} UTC",
    core_state: "BTC CORE · {s}", core_routing: "ROUTING", core_idle: "IDLE", core_paused: "PAUSED", core_guard: "GUARD",
    ticket_line: "TICKET {id} · {dir} · {status}", no_ticket: "NO OPEN TICKET", h24: "24H",
    deck_text: "{dir} {qty} BTC · EDGE {edge} · {stake} · TICKET {id}",
    pnl_sub: "BTCUSDT · {mode} BOOK · SIX AGENTS · {n} SETTLED", settled_last: "SETTLED BTC {dir} 15M", no_settle: "NO SETTLEMENT YET",
    candle_right: "RSI 14 · {rsi} · Z {z} · SIGNALS {n}", analog_right: "DTW {dtw} · SCAN {n}", bars: "{n} BARS",
    log_right: "{n} ENTRIES · {t} UTC", log_empty: "THE FIRST TICKET WRITES THE FIRST LINE",
    foot_online: "ONLINE", foot_lost: "STREAM LOST", foot_paused: "PAUSED", foot_guard: "GUARD", foot_connecting: "CONNECTING",
    foot_mode: "{mode} BOOK · SETTLES AT HORIZON · {m}M",
    swarm_online: "SWARM ONLINE", swarm_paused: "SWARM PAUSED", swarm_guard: "GUARD ACTIVE", swarm_lost: "STREAM LOST",
    swarm_offline: "ENGINE OFFLINE", swarm_connecting: "CONNECTING",
    tip_resume: "Resume the swarm", tip_pause: "Pause the swarm (open tickets still settle)", tip_offline: "Engine not reachable",
    mode_paper: "PAPER", mode_live: "LIVE",
    status_routing: "ROUTING", status_on_deck: "ON DECK", status_open: "OPEN",
    dn_spotter: "RSI {rsi} · VOL Z {v}", dn_wait: "WAITING FOR TAPE", dn_prior: "ANALOG {u}↑ {d}↓ · MATCH {m}", dn_scanning: "SCANNING HISTORY",
    dn_edge: "MODEL {p} VS BOOK {b}", dn_kelly: "CAP BY {b} · NOTCH {n}/10", dn_taker: "{mode} BROKER · SPREAD {s}", dn_closer: "{n} HOLDING · {w}W {l}L",
    dm_pup: "P(UP) {p}", dm_min: "{n}/MIN", dm_win: "WIN {p}", dm_nosettle: "NO SETTLEMENTS",
    up_dn: "{u}% UP / {d}% DN", bid_pct: "{p}% BID",
    msg_scan: "SCAN QUEUED", msg_keys: "ADD API KEYS TO .env FOR LIVE MODE", msg_mode: "MODE {m} SAVED · RESTART ENGINE",
    msg_saved: "LIMITS SAVED · ENFORCED FROM THE NEXT TICKET",
    confirm_live: "Switch to LIVE? Real orders will be placed on Bybit after the engine restarts.",
    ch_seed: "SEED", ch_vwap: "VWAP", ch_long: "LONG", ch_short: "SHORT", ch_median: "MEDIAN",
    ch_history_empty: "BALANCE HISTORY STARTS WITH THE FIRST TICK", ch_wait_tape: "WAITING FOR THE TAPE",
    ch_scanning: "SCANNING HISTORY FOR THIS SHAPE", ch_bars: "+{n} BARS", ch_bid: "BID", ch_ask: "ASK",
    fl_core: "BTC CORE", fl_deck: "ON DECK", fl_offline: "STREAM OFFLINE · RECONNECTING", fl_waiting: "WAITING FOR STATE",
    fl_engine: "CORE ENGINE", fl_network: "SIX-AGENT TRADING NETWORK", fl_sysstatus: "SYSTEM STATUS", fl_allonline: "ALL AGENTS ONLINE",
    fl_online: "ONLINE", fl_status: "STATUS", fl_realtime: "REAL-TIME PROCESSING", fl_tagline: "6 AGENTS  /  1 CORE  /  BYBIT BTCUSDT 15M",
    fl_bar_book: "BID SHARE", fl_bar_tickets: "TICKETS", fl_bar_dd: "DRAWDOWN", fl_bar_stake: "STAKE",
    fl_verb_spotter: "SCAN", fl_verb_prior: "PRICE", fl_verb_edge: "EDGE", fl_verb_kelly: "SIZE", fl_verb_taker: "EXECUTE", fl_verb_closer: "SETTLE",
    dir_UP: "UP", dir_DOWN: "DOWN",
  };

  const JA = {
    brand_tag: "6エージェント · ワンフロア · BTC 15分",
    nav_floor: "フロア", nav_tape: "テープ", nav_book: "ブック",
    st_uptime: "稼働時間", st_handoffs: "ハンドオフ", st_settled: "決済数",
    tg_fit: "固定幅", tg_wide: "全幅",
    si_live: "エージェント稼働中", si_lost: "ストリーム切断", si_holder: "担当", si_hpm: "ハンドオフ/分", si_fair: "モデル", si_vs: "対 市場",
    si_edge: "エッジ", si_open: "保有", si_tickets: "チケット", si_human: "人の承認", si_approvals: "必須モード",
    si_away: "不在中の決済", si_dd: "日次DD", si_guard: "ガード",
    office_title: "オフィス", office_sub: "— 6デスク · ワンブック · コアが全チケットを回す",
    mvb_title: "モデル 対 ブック", mvb_fair: "モデル", mvb_book: "ブック", mvb_edge: "エッジ", mvb_stake: "建玉額",
    deck_lbl: "承認待ち", approve: "承認", reject: "却下",
    pnl_title: "スウォーム損益", pnl_sub1: "— ワンブック · 残高履歴 ·", pnl_running: "運用中",
    roi: "ROI", on: "/ 元本", seed: "", win_rate: "勝率", avg_edge: "平均エッジ", max_dd: "最大DD",
    bias_dir: "方向バイアス", bias_conf: "モデル確信度", bias_book: "板の圧力",
    candle_title: "キャンドルエンジン", candle_sub: "— BTC 1分足 · VWAP · Zバンド · ライブ板",
    analog_title: "アナログマッチャー", analog_sub: "— k-NN · 過去の類似局面",
    an_hist: "履歴 · 48本 · Zスコア", an_now: "現在", an_next: "その後の推移",
    an_match: "一致度", an_up: "上昇", an_down: "下落", an_median: "中央値", an_horizon: "ホライズン",
    log_title: "アクティビティログ", log_sub: "— 6エージェント · 全ステップ",
    foot_route: "6デスク · ワンブック · コアが全チケットを回す", foot_venue: "BYBIT · BTCUSDT · USDT無期限",
    risk_title: "リスク上限", risk_sub: "— エンジンが強制適用",
    r_lev: "最大レバレッジ", r_risk: "1チケットのリスク", r_dd: "日次DDガード", r_kelly: "ケリー係数", r_edge: "最小エッジ ¢",
    r_open: "最大保有数", r_hor: "ホライズン（本）", r_sl: "損切り", r_tp: "利確", r_save: "上限を保存", r_scan: "今すぐチケットを起票",
    r_note: "モード切替（ペーパー ↔ リアル）には .env の API キーとエンジン再起動が必要です。",
    tele_book: "板 · 50段", tele_funding: "資金調達率", tele_spread: "スプレッド", tele_oi: "建玉", tele_basis: "マーク − 指数", tele_atr: "ATR 15分",
    stage_spotter: "スキャン", stage_prior: "プライシング", stage_edge: "エッジ", stage_kelly: "サイジング", stage_taker: "執行", stage_closer: "決済",
    state_idle: "待機", state_run: "実行中", state_done: "完了", state_on_deck: "承認待ち", state_holding: "保有中",
    working: "ブック稼働中 · ステージ {n} · {stage}", paused_open: "スウォーム一時停止 · 保有チケットは決済継続",
    guard_closed: "ドローダウンガード · 00:00 UTC までデスク閉鎖", idle_next: "待機 · 次回スキャン {t} UTC",
    core_state: "BTC コア · {s}", core_routing: "ルーティング中", core_idle: "待機", core_paused: "一時停止", core_guard: "ガード",
    ticket_line: "チケット {id} · {dir} · {status}", no_ticket: "保有チケットなし", h24: "24時間",
    deck_text: "{dir} {qty} BTC · エッジ {edge} · {stake} · チケット {id}",
    pnl_sub: "BTCUSDT · {mode}ブック · 6エージェント · 決済 {n} 件", settled_last: "BTC {dir} 15分 を決済", no_settle: "まだ決済なし",
    candle_right: "RSI 14 · {rsi} · Z {z} · シグナル {n}", analog_right: "DTW {dtw} · 走査 {n}", bars: "{n}本",
    log_right: "{n} 件 · {t} UTC", log_empty: "最初のチケットが最初の1行を書きます",
    foot_online: "オンライン", foot_lost: "ストリーム切断", foot_paused: "一時停止", foot_guard: "ガード", foot_connecting: "接続中",
    foot_mode: "{mode}ブック · ホライズンで決済 · {m}分",
    swarm_online: "スウォーム稼働中", swarm_paused: "スウォーム一時停止", swarm_guard: "ガード発動中", swarm_lost: "ストリーム切断",
    swarm_offline: "エンジン停止", swarm_connecting: "接続中",
    tip_resume: "スウォームを再開", tip_pause: "スウォームを一時停止（保有チケットは決済継続）", tip_offline: "エンジンに接続できません",
    mode_paper: "ペーパー", mode_live: "リアル",
    status_routing: "ルーティング中", status_on_deck: "承認待ち", status_open: "保有中",
    dn_spotter: "RSI {rsi} · 出来高Z {v}", dn_wait: "テープ待ち", dn_prior: "アナログ {u}↑ {d}↓ · 一致 {m}", dn_scanning: "履歴を走査中",
    dn_edge: "モデル {p} 対 ブック {b}", dn_kelly: "上限要因 {b} · 段階 {n}/10", dn_taker: "{mode}ブローカー · スプレッド {s}", dn_closer: "保有 {n} · {w}勝 {l}敗",
    dm_pup: "P(上昇) {p}", dm_min: "{n}/分", dm_win: "勝率 {p}", dm_nosettle: "決済なし",
    up_dn: "上昇 {u}% / 下落 {d}%", bid_pct: "買い {p}%",
    msg_scan: "スキャンを予約しました", msg_keys: "リアルモードには .env に API キーが必要です", msg_mode: "モード {m} を保存 · エンジンを再起動してください",
    msg_saved: "上限を保存 · 次のチケットから適用",
    confirm_live: "リアルモードに切り替えますか？ エンジン再起動後、Bybit に実際の注文が出されます。",
    ch_seed: "元本", ch_vwap: "VWAP", ch_long: "買い", ch_short: "売り", ch_median: "中央値",
    ch_history_empty: "残高履歴は最初のティックから始まります", ch_wait_tape: "テープ待ち",
    ch_scanning: "この形を履歴から走査中", ch_bars: "+{n}本", ch_bid: "買い", ch_ask: "売り",
    fl_core: "BTC コア", fl_deck: "承認待ち", fl_offline: "ストリーム切断 · 再接続中", fl_waiting: "状態待ち",
    fl_engine: "コアエンジン", fl_network: "6エージェント取引ネットワーク", fl_sysstatus: "システム状態", fl_allonline: "全エージェント稼働中",
    fl_online: "稼働中", fl_status: "状態", fl_realtime: "リアルタイム処理", fl_tagline: "6エージェント / 1コア / BYBIT BTCUSDT 15分",
    fl_bar_book: "買い比率", fl_bar_tickets: "チケット", fl_bar_dd: "ドローダウン", fl_bar_stake: "建玉額",
    fl_verb_spotter: "スキャン", fl_verb_prior: "価格付け", fl_verb_edge: "エッジ", fl_verb_kelly: "サイズ", fl_verb_taker: "執行", fl_verb_closer: "決済",
    dir_UP: "上昇", dir_DOWN: "下落",
  };

  const ACTION_JA = { SCAN: "スキャン", RESEARCH: "調査", PRICE: "価格付け", EDGE: "エッジ", SIZE: "サイズ", FILL: "約定", SETTLE: "決済", GUARD: "ガード", PASS: "見送り", HOLD: "保留", SYSTEM: "システム" };
  const WORD_JA = {
    "boot scan": "起動時スキャン", "15m close": "15分足確定", "manual scan": "手動スキャン",
    stop: "損切り", target: "利確", horizon: "ホライズン", above: "上", below: "下",
    kelly: "ケリー", risk: "リスク", leverage: "レバレッジ", paper: "ペーパー", live: "リアル",
    PAPER: "ペーパー", LIVE: "リアル", mainnet: "メインネット", testnet: "テストネット", tick: "ティック", rescan: "再スキャン",
    "holding to horizon": "ホライズンまで保有", "awaiting approval": "承認待ち",
  };
  const LOG_JA = {
    boot: "デスク起動 · {mode}モード · {sym} 15分 · {net}データ",
    inst_fail: "銘柄情報の取得に失敗 · {err}",
    loaded: "1分足 {n1} 本 · 15分足 {n15} 本 · 板 {b}×{a} を読込",
    hist_fail: "履歴の読込に失敗 · {err}",
    stream_on: "ストリーム接続 · スウォーム稼働", stream_off: "ストリーム切断 · 再接続中",
    err: "{what}エラー · {err}",
    guard_reset: "UTC日付更新 · ドローダウンガード解除 · デスク再開",
    guard_hit: "ドローダウンガード発動 {dd} · 次のUTC日まで新規チケット停止",
    close_fail: "決済失敗 · {err}",
    settled: "BTC {dir} 15分 を決済 · {reason} · 出口 {exit} · 通算 {w}勝 {l}敗",
    hold_paused: "{reason} · スウォーム一時停止中 · 起票なし",
    hold_guard: "{reason} · ドローダウンガード中 · 起票なし",
    hold_cap: "{reason} · 保有 {n} 件で上限 · 起票なし",
    scan: "チケット {tid} 起票 · RSI14 {rsi} · VWAPの{side} {vwap} · z {z} · 出来高z {volz}",
    price: "モデル {p} 上昇 · アナログ {up}↑ {down}↓ 一致 {match} · モメンタム {mom}",
    edge_pass: "{dir} エッジ {edge} 対 ブック {book} · 下限 {floor} 未満 · 見送り",
    edge_ok: "{dir} · モデル {p} 対 ブック {book} · エッジ下限を通過",
    size_zero: "{mark} ではサイズが 0 · f* {f} · 見送り",
    size: "{qty} BTC · ハーフケリー f {f} · 上限要因 {binding} · DDガード {notch}/10 · {cut}",
    deck: "チケット {tid} 承認待ち · 人の承認が必要 · {dir} {qty} BTC",
    expired: "チケット {tid} は承認前に期限切れ",
    approved: "オペレーターがチケット {tid} を承認", rejected: "オペレーターがチケット {tid} を却下",
    order_fail: "注文失敗 · {err}",
    fill: "{qty} BTC を {entry} で{verb} · 損切 {sl} · 利確 {tp} · {broker}",
    r_spotter: "再スキャン · 1分足 {n} 本 · 出来高z {volz} · ATR {atr}",
    r_prior: "アナログ走査 {n} 窓 · 最良DTW {dtw} · {up}↑ {down}↓ / {h}本先",
    r_edge: "板の偏り {imb}（50段）· スプレッド {spread} · 資金調達率 {funding}",
    r_kelly: "ドローダウン {dd} / ガード {guard} · 段階 {notch}/10 · 上限要因 {binding}",
    r_taker: "マーク {mark} · 指数 {index} · 建玉 {oi} BTC",
    r_closer: "保有 {n} 件 · 含み損益 {unreal}",
    settings: "設定変更 · {fields}",
    op_pause: "オペレーターがスウォームを一時停止 · 保有チケットは決済継続",
    op_resume: "オペレーターがスウォームを再開",
    op_approvals: "承認必須モード {on}",
    op_mode: "モードを {mode} に設定 · ブローカー切替はエンジン再起動が必要",
  };

  let lang = "en";
  const fmt = (s, p) => s.replace(/\{(\w+)\}/g, (_, k) => (p && p[k] != null ? p[k] : ""));
  const t = (key, p) => fmt((lang === "ja" ? JA[key] : undefined) ?? EN[key] ?? key, p);
  const dir = (d) => (d ? t("dir_" + d) : "");
  const word = (w) => (lang === "ja" ? WORD_JA[w] ?? w : w);
  const action = (a) => (lang === "ja" ? ACTION_JA[a] ?? a : a);
  function logText(e) {
    if (lang !== "ja" || !e.key || !LOG_JA[e.key]) return e.text;
    const p = { ...(e.p || {}) };
    if (p.dir) p.dir = dir(p.dir);
    for (const k of ["reason", "side", "binding", "broker", "mode", "net", "what"]) if (p[k] != null) p[k] = word(p[k]);
    if (e.key === "size") p.cut = p.notch ? `${p.notch}段階縮小` : "フルサイズ";
    if (e.key === "fill") p.verb = (e.p && e.p.dir) === "UP" ? "買い" : "売り";
    if (e.key === "op_approvals") p.on = p.on ? "オン" : "オフ";
    return fmt(LOG_JA[e.key], p);
  }
  function set(l) {
    lang = l === "ja" ? "ja" : "en";
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    try { localStorage.setItem("btcdesk.lang", lang); } catch (e) { /* storage unavailable */ }
  }
  const get = () => lang;
  return { t, dir, word, action, logText, set, get };
})();
