-- WORK PASS : 連絡先を「電話番号・メールアドレス」に分割 追加マイグレーション（既存の本番DB用）
-- Supabase ダッシュボード → SQL Editor（プロジェクト work pass）に貼り付けて Run してください。
-- 求職者テーブルに phone（電話番号）と email（メールアドレス）の列を追加します。
-- 既存の稼働中アプリには無害。既存データの旧 contact 列はそのまま残ります。

alter table candidates add column if not exists phone text;
alter table candidates add column if not exists email text;
