-- WORK PASS : 「稼ぎたい年収（目標年収）」項目 追加マイグレーション（既存の本番DB用）
-- Supabase ダッシュボード → SQL Editor に貼り付けて Run してください。
-- 求職者テーブルに target_income（万円・整数）の列を追加します。
-- 既存の稼働中アプリには無害（古いコードはこの列を使いません）。

alter table candidates add column if not exists target_income int;
