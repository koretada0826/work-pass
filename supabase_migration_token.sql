-- WORK PASS : ログイン認証 追加マイグレーション（既存の本番DB用）
-- Supabase ダッシュボード → SQL Editor に貼り付けて Run してください。
-- 求職者ごとの「本人専用リンク用トークン」列を追加します。

-- 1) token 列を追加（存在しない場合のみ）
alter table candidates add column if not exists token text;

-- 2) 既存の求職者に推測不可能なトークンを付与（未設定の行のみ）
--    gen_random_uuid() は Postgres 標準。追加拡張は不要です。
update candidates
set token = replace(gen_random_uuid()::text, '-', '')
where token is null;

-- 3) 一意制約（重複防止）
create unique index if not exists idx_candidates_token on candidates(token);
