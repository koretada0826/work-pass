-- WORK PASS : Supabase(PostgreSQL) テーブル作成SQL
-- Supabase ダッシュボード → SQL Editor に貼り付けて Run すると全テーブルが作成されます。

create table if not exists candidates (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  status text not null default '登録済',
  token text unique,  -- 求職者本人の専用リンク用（推測不可トークン）
  name text, age int, nearest_station text, commute_range int, contact text,
  pref_location text, pref_days text, pref_time text, pref_employment text,
  pref_annual_income int, pref_monthly_income int, change_timing text,
  skill_sales int, skill_hospitality int, skill_admin int, skill_pc int, skill_ai int, qualifications text,
  career_job text, career_industry text, goal_3y text, goal_5y text, future_work text, mbti text,
  val_income int, val_growth int, val_stability int, val_relationship int, val_wlb int,
  iv_impression int, iv_comm int, iv_proactive int, iv_personality int,
  iv_comment text, iv_evaluator text, iv_date timestamptz
);

create table if not exists work_histories (
  id bigserial primary key,
  candidate_id bigint references candidates(id) on delete cascade,
  industry text, job_type text, years real, achievement text, resignation_reason text
);

create table if not exists test_results (
  candidate_id bigint references candidates(id) on delete cascade,
  test_key text,
  score int,
  detail jsonb,
  taken_at timestamptz default now(),
  primary key (candidate_id, test_key)
);

create table if not exists ai_analysis (
  candidate_id bigint primary key references candidates(id) on delete cascade,
  json jsonb,
  created_at timestamptz default now()
);

create table if not exists jobs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  company_name text, title text, employment_type text,
  salary_min int, salary_max int,
  location text, remote text,
  description text, requirements text,
  industry text, company_size text, company_tags text, job_category text,
  work_time text, overtime text, holidays text, benefits text,
  required_experience text, required_qualifications text,
  req_aptitude text, req_persona text, req_values text
);
