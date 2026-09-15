# BTC DESK

Bybit BTCUSDT 無期限先物を対象にした、6 デスク構成の自動売買システム。
SPOTTER → PRIOR → EDGE → KELLY → TAKER → CLOSER の順に毎チケットをルーティングし、
すべての判断を画面上のオフィスフロアとアクティビティログに書き出します。

## 起動

```bash
pip install -r requirements.txt
copy .env.example .env
python run.py
```

ブラウザで http://127.0.0.1:8765 を開きます。

- 画面右上の **EN / 日本語** で表示言語を切り替えられます（ログ行も再描画されます。設定はブラウザに保存）。

- 既定は **PAPER モード**（Bybit メインネットの実データ、約定はシミュレーション、手数料 0.055% とスリッページ込み）。
- 公開データ（ローソク足・ティッカー・板・約定）に API キーは不要です。
- 台帳（チケット・残高履歴・ログ）は `data/ledger.sqlite` に保存され、再起動しても引き継がれます。

## LIVE モードへの切替

1. `.env` に `BYBIT_API_KEY` / `BYBIT_API_SECRET` を設定（先物取引権限が必要）。
2. `TRADING_MODE=live` にするか、画面上部の PAPER チップをクリックして切替（確認ダイアログあり）。
3. エンジンを再起動。TAKER が成行注文を出し、SL/TP は注文に付与されます。

`BYBIT_TESTNET=true` でテストネット API に切り替わります。

## 戦略（15 分足 UP/DOWN）

| デスク | 役割 |
|---|---|
| SPOTTER | RSI14・EMA9/21・VWAP 乖離・z バンド・出来高 z・1h モメンタムを毎秒計算し、15 分足確定でチケットを起票 |
| PRIOR | 特徴量と k-NN アナログマッチャー（直近 48 本の 1m 足を 3,000 本の履歴と照合、24 本先の結果分布）から P(UP) を算出 |
| EDGE | 板の偏り・1h モメンタム・資金調達率から市場が織り込む確率を推定し、モデルとの差（¢）が閾値以上なら通過 |
| KELLY | ハーフケリーで名目額を決定。リスク上限（1 チケット 2%）・最大レバレッジ（3×）・日次ドローダウンガード（4.2%、10 段階で縮小）でキャップ |
| TAKER | 成行で執行（PAPER は仮想約定）。承認モード時は人の APPROVE 待ち |
| CLOSER | 損切り 0.6% / 利確 0.9% / 15 分ホライズン到達で決済し、勝率・平均エッジ・最大 DD を更新 |

リスク上限は画面右上 BOOK → RISK LIMITS で変更でき、`data/settings.json` に保存されます。

## 構成

```
backend/
  bybit.py      Bybit v5 REST（署名付き）+ 公開 WebSocket（自動再接続）
  indicators.py RSI / EMA / VWAP / z バンド / ATR
  analog.py     k-NN アナログマッチャー + DTW
  model.py      PRIOR（確率モデル）/ EDGE（市場推定）/ KELLY（サイジング）
  broker.py     PaperBroker / LiveBroker
  engine.py     6 デスクのパイプライン、リスクガード、台帳、状態配信
  storage.py    SQLite 台帳
  server.py     FastAPI（静的 UI・/api/state・/ws・操作 API）
frontend/
  index.html / app.css / app.js   ダッシュボード
  floor.js      アイソメトリックのオフィスフロア（Canvas 2D）
  charts.js     ローソク足・資産曲線・アナログ・スパークライン
```

## 注意

- Python 3.13+ は既定で厳格な X.509 検証を有効にしており、Bybit の証明書チェーンがそれに引っかかるため、`backend/bybit.py` はその厳格フラグのみを外しています（ホスト名・チェーン検証は有効のまま）。
- PAPER の成績は実運用の成績を保証しません。LIVE 切替前に十分な期間 PAPER で検証してください。


## 検証ループ（loop engineering）

```bash
pip install -r requirements-dev.txt
python tools/check.py            # lint + オフラインテスト（合成取引所で6デスクを一周）
python tools/check.py --live     # + Bybitメインネットの公開データで20秒のスモーク
python tools/check.py --watch    # ソース変更のたびに自動で再実行
```

- 失敗があれば終了コードが非0になります。直して再実行、「ALL GREEN」になるまで回すのが基本サイクルです。
- GitHub Actions（`.github/workflows/check.yml`）が push ごとに lint + テストを走らせます。

## 運用（24時間）

- `powershell -ExecutionPolicy Bypass -File run_forever.ps1` でクラッシュ時に自動再起動します。
- 稼働確認は `GET /api/health`（ストリーム切断や足の停止で 503）。ログは `data/engine.log`（ローテーション）。
- LAN に公開する場合（`HOST=0.0.0.0`）は `.env` に `DESK_TOKEN` を設定してください。設定変更・一時停止・承認などの操作APIはトークン必須になります。
- 日次ドローダウンガードと日中ピークは再起動をまたいで保持されます。ライブ口座は起動時に取引所のポジションと突き合わせ、食い違いはログに残して自動では触りません。
