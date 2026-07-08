'use strict';
// WORK PASS - データ層（Node内蔵SQLite / 依存ゼロ）
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'workpass.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '登録済',
  -- 基本情報
  name TEXT, age INTEGER, nearest_station TEXT, commute_range INTEGER, contact TEXT,
  -- 勤務条件
  pref_location TEXT, pref_days TEXT, pref_time TEXT, pref_employment TEXT,
  pref_annual_income INTEGER, pref_monthly_income INTEGER, change_timing TEXT,
  -- スキル(0-5) + 資格
  skill_sales INTEGER, skill_hospitality INTEGER, skill_admin INTEGER,
  skill_pc INTEGER, skill_ai INTEGER, qualifications TEXT,
  -- キャリア
  career_job TEXT, career_industry TEXT, goal_3y TEXT, goal_5y TEXT, future_work TEXT,
  -- 価値観(0-5)
  val_income INTEGER, val_growth INTEGER, val_stability INTEGER,
  val_relationship INTEGER, val_wlb INTEGER,
  -- 面談評価(1-5) + コメント（担当が後入力）
  iv_impression INTEGER, iv_comm INTEGER, iv_proactive INTEGER, iv_personality INTEGER,
  iv_comment TEXT, iv_evaluator TEXT, iv_date TEXT
);

CREATE TABLE IF NOT EXISTS work_histories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL,
  industry TEXT, job_type TEXT, years REAL, achievement TEXT, resignation_reason TEXT,
  FOREIGN KEY(candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS aptitude_results (
  candidate_id INTEGER PRIMARY KEY,
  sales INTEGER, hospitality INTEGER, admin INTEGER, management INTEGER, communication INTEGER,
  taken_at TEXT,
  FOREIGN KEY(candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS knowledge_results (
  candidate_id INTEGER PRIMARY KEY,
  manners INTEGER, keigo INTEGER, japanese INTEGER, math INTEGER, it INTEGER, total INTEGER,
  taken_at TEXT,
  FOREIGN KEY(candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS test_results (
  candidate_id INTEGER NOT NULL,
  test_key TEXT NOT NULL,
  score INTEGER,
  detail TEXT,
  taken_at TEXT,
  PRIMARY KEY(candidate_id, test_key),
  FOREIGN KEY(candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS ai_analysis (
  candidate_id INTEGER PRIMARY KEY,
  json TEXT,
  created_at TEXT,
  FOREIGN KEY(candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  company_name TEXT, title TEXT, employment_type TEXT,
  salary_min INTEGER, salary_max INTEGER,
  location TEXT, remote TEXT,
  description TEXT, requirements TEXT
);
`);
// jobs 追加カラム（既存DBにも安全に足す）
for (const col of ['industry TEXT','company_size TEXT','company_tags TEXT','job_category TEXT',
  'work_time TEXT','overtime TEXT','holidays TEXT','benefits TEXT',
  'required_experience TEXT','required_qualifications TEXT',
  'req_aptitude TEXT','req_persona TEXT','req_values TEXT']) {
  try { db.exec(`ALTER TABLE jobs ADD COLUMN ${col}`); } catch {}
}

const CAND_FIELDS = [
  'name','age','nearest_station','commute_range','contact',
  'pref_location','pref_days','pref_time','pref_employment',
  'pref_annual_income','pref_monthly_income','change_timing',
  'skill_sales','skill_hospitality','skill_admin','skill_pc','skill_ai','qualifications',
  'career_job','career_industry','goal_3y','goal_5y','future_work',
  'val_income','val_growth','val_stability','val_relationship','val_wlb'
];

function createCandidate(data, histories) {
  const cols = ['created_at','status', ...CAND_FIELDS];
  const placeholders = cols.map(() => '?').join(',');
  const now = new Date().toISOString();
  const vals = [now, '登録済', ...CAND_FIELDS.map(f => data[f] ?? null)];
  const info = db.prepare(`INSERT INTO candidates (${cols.join(',')}) VALUES (${placeholders})`).run(...vals);
  const id = Number(info.lastInsertRowid);
  if (Array.isArray(histories)) {
    const h = db.prepare('INSERT INTO work_histories (candidate_id,industry,job_type,years,achievement,resignation_reason) VALUES (?,?,?,?,?,?)');
    for (const w of histories) {
      if (!w || (!w.industry && !w.job_type)) continue;
      h.run(id, w.industry ?? null, w.job_type ?? null, w.years ?? null, w.achievement ?? null, w.resignation_reason ?? null);
    }
  }
  return id;
}

function listCandidates() {
  const rows = db.prepare(`
    SELECT c.id, c.created_at, c.status, c.name, c.age, c.nearest_station, c.contact,
      c.career_job, c.pref_annual_income,
      (SELECT COUNT(*) FROM test_results t WHERE t.candidate_id=c.id) AS tests_done,
      (SELECT AVG(score) FROM test_results t WHERE t.candidate_id=c.id) AS apt_avg,
      (SELECT score FROM test_results t WHERE t.candidate_id=c.id AND t.test_key='general') AS knowledge_total,
      (SELECT 1 FROM candidates cc WHERE cc.id=c.id AND cc.iv_date IS NOT NULL) AS has_interview
    FROM candidates c ORDER BY c.id DESC`).all();
  return rows;
}

function getCandidate(id) {
  const c = db.prepare('SELECT * FROM candidates WHERE id=?').get(id);
  if (!c) return null;
  c.work_histories = db.prepare('SELECT * FROM work_histories WHERE candidate_id=?').all(id);
  const trs = db.prepare('SELECT test_key,score,detail,taken_at FROM test_results WHERE candidate_id=?').all(id);
  c.tests = {};
  for (const t of trs) c.tests[t.test_key] = { score:t.score, detail: t.detail?JSON.parse(t.detail):null, taken_at:t.taken_at };
  const a = db.prepare('SELECT json,created_at FROM ai_analysis WHERE candidate_id=?').get(id);
  c.ai_analysis = a ? { ...JSON.parse(a.json), created_at: a.created_at } : null;
  return c;
}

const JOB_FIELDS = ['company_name','title','employment_type','salary_min','salary_max','location','remote','description','requirements',
  'industry','company_size','company_tags','job_category','work_time','overtime','holidays','benefits',
  'required_experience','required_qualifications','req_aptitude','req_persona','req_values'];
function createJob(data) {
  const cols = ['created_at', ...JOB_FIELDS];
  const vals = [new Date().toISOString(), ...JOB_FIELDS.map(f => data[f] ?? null)];
  const info = db.prepare(`INSERT INTO jobs (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).run(...vals);
  return Number(info.lastInsertRowid);
}
function listJobs() { return db.prepare('SELECT * FROM jobs ORDER BY id DESC').all(); }
function getJob(id) { return db.prepare('SELECT * FROM jobs WHERE id=?').get(id) || null; }
function listCandidatesFull() { return db.prepare('SELECT id FROM candidates ORDER BY id DESC').all().map(r => getCandidate(r.id)); }

function saveAnalysis(id, analysis) {
  db.prepare(`INSERT INTO ai_analysis (candidate_id,json,created_at) VALUES (?,?,?)
    ON CONFLICT(candidate_id) DO UPDATE SET json=excluded.json,created_at=excluded.created_at`)
    .run(id, JSON.stringify(analysis), new Date().toISOString());
}

function updateCandidate(id, fields) {
  const allow = new Set([...CAND_FIELDS, 'status', 'iv_impression','iv_comm','iv_proactive','iv_personality','iv_comment','iv_evaluator','iv_date']);
  const sets = [], vals = [];
  for (const [k,v] of Object.entries(fields||{})) { if (allow.has(k)) { sets.push(`${k}=?`); vals.push(v ?? null); } }
  if (!sets.length) return;
  vals.push(id);
  db.prepare(`UPDATE candidates SET ${sets.join(',')} WHERE id=?`).run(...vals);
}

function saveTestResult(id, key, result) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO test_results (candidate_id,test_key,score,detail,taken_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(candidate_id,test_key) DO UPDATE SET score=excluded.score,detail=excluded.detail,taken_at=excluded.taken_at`)
    .run(id, key, result.score, JSON.stringify(result.detail||{}), now);
  if (result.values) updateCandidate(id, result.values); // 性格診断→価値観へ反映
  bumpStatus(id, '診断済');
}

function saveAptitude(id, scores) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO aptitude_results (candidate_id,sales,hospitality,admin,management,communication,taken_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(candidate_id) DO UPDATE SET sales=excluded.sales,hospitality=excluded.hospitality,
      admin=excluded.admin,management=excluded.management,communication=excluded.communication,taken_at=excluded.taken_at`)
    .run(id, scores.sales, scores.hospitality, scores.admin, scores.management, scores.communication, now);
  bumpStatus(id, '診断済');
}

function saveKnowledge(id, s) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO knowledge_results (candidate_id,manners,keigo,japanese,math,it,total,taken_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(candidate_id) DO UPDATE SET manners=excluded.manners,keigo=excluded.keigo,
      japanese=excluded.japanese,math=excluded.math,it=excluded.it,total=excluded.total,taken_at=excluded.taken_at`)
    .run(id, s.manners, s.keigo, s.japanese, s.math, s.it, s.total, now);
  bumpStatus(id, '診断済');
}

function saveInterview(id, iv) {
  db.prepare(`UPDATE candidates SET iv_impression=?, iv_comm=?, iv_proactive=?, iv_personality=?,
    iv_comment=?, iv_evaluator=?, iv_date=? WHERE id=?`)
    .run(iv.iv_impression ?? null, iv.iv_comm ?? null, iv.iv_proactive ?? null, iv.iv_personality ?? null,
      iv.iv_comment ?? null, iv.iv_evaluator ?? null, new Date().toISOString(), id);
  bumpStatus(id, '面談済');
}

// ステータスは前進のみ（登録済→診断済→面談済）
const ORDER = { '登録済':0, '診断済':1, '面談済':2, '採用':3, '保留':3, '紹介可':3 };
function bumpStatus(id, next) {
  const cur = db.prepare('SELECT status FROM candidates WHERE id=?').get(id);
  if (!cur) return;
  if ((ORDER[next] ?? 0) > (ORDER[cur.status] ?? 0)) {
    db.prepare('UPDATE candidates SET status=? WHERE id=?').run(next, id);
  }
}

function getStats() {
  const total = db.prepare('SELECT COUNT(*) n FROM candidates').get().n;
  const withApt = db.prepare('SELECT COUNT(*) n FROM aptitude_results').get().n;
  // 価値観分布：各求職者が最も高い価値観を集計（成長/安定/人間関係/WLB）
  const rows = db.prepare('SELECT val_growth,val_stability,val_relationship,val_wlb FROM candidates').all();
  const dims = [
    { key:'成長重視', col:'val_growth', color:'#3b82f6' },
    { key:'安定重視', col:'val_stability', color:'#22c55e' },
    { key:'人間関係重視', col:'val_relationship', color:'#f5b400' },
    { key:'ワークライフバランス重視', col:'val_wlb', color:'#a78bfa' },
  ];
  const counts = [0,0,0,0];
  for (const r of rows) {
    let best = -1, bi = 0;
    dims.forEach((d,i)=>{ const v = r[d.col] ?? 0; if (v > best) { best = v; bi = i; } });
    if (best > 0) counts[bi]++;
  }
  const sum = counts.reduce((a,b)=>a+b,0) || 1;
  const distribution = dims.map((d,i)=>({ label:d.key, color:d.color, count:counts[i], percent:Math.round(counts[i]/sum*1000)/10 }));
  return { total, withAptitude:withApt, distributionTotal:counts.reduce((a,b)=>a+b,0), distribution };
}

module.exports = { createCandidate, listCandidates, getCandidate, updateCandidate, saveTestResult, saveInterview, saveAnalysis, getStats, createJob, listJobs, getJob, listCandidatesFull };
