# WORK PASS

「人ではなく、相性で採用する。」— Everエフォート起点の AIマッチング型 人材データベース。

求職者を詳細にデータベース化し（プロフィール＋5つの適性診断＋自由記述の目標）、企業求人と **AI（Gemini）が文章まで読み取ってマッチング**します。

## 構成
- `workpass/` … アプリ本体（依存ゼロ・Node標準の http サーバー＋内蔵SQLite）
  - `server.js` … HTTPサーバー＋API＋静的配信
  - `db.js` … node:sqlite（求職者/診断/求人/AI分析）
  - `questions.js` … 5診断（一般常識・営業適性・コミュニケーション・性格・ビジネスマナー）
  - `gemini.js` … Gemini API による AIキャリア診断・求人×求職者マッチング
  - `public/` … 画面（登録ウィザード・診断・管理ダッシュボード・求人登録・AIマッチング）
- `WORK_PASS_設計仕様書_v0.1.md` … 設計仕様書
- `人材DB_詳細ヒヤリング設計_v0.1.md` … 人材DB詳細設計
- `企業リスト収集ツール_ビルドプロンプト.md` … 別軸（企業開拓）ビルド指示

## 起動方法
```bash
cd workpass
node server.js       # http://localhost:4000
```
Node.js 22.5 以上（内蔵 SQLite を使用）。

## AI（無料・任意）
`workpass/.env` に Gemini APIキーを設定すると AI 分析・マッチングが有効になります。
```
GEMINI_API_KEY=あなたのキー
GEMINI_MODEL=gemini-2.5-flash
```
※ `.env` と `workpass.db`（個人情報を含む）は `.gitignore` で除外しています。

## アクセス
- 運営（採用担当）: `http://localhost:4000/admin.html`
- 求職者: `http://localhost:4000/`
