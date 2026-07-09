-- WORK PASS : MBTI（任意）項目 追加マイグレーション（既存の本番DB用）
-- Supabase ダッシュボード → SQL Editor に貼り付けて Run してください。
-- 求職者テーブルに MBTI（16タイプ性格診断・任意）の列を追加します。
-- 既存の稼働中アプリには無害（古いコードはこの列を使いません）。

alter table candidates add column if not exists mbti text;
