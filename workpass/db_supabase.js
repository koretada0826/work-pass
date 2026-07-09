'use strict';
// WORK PASS - データ層（Supabase / PostgREST を fetch で叩く・依存ゼロ・Vercel対応）
const URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const BASE = URL + '/rest/v1';
const crypto = require('crypto');
// 求職者ごとの推測不可能な公開トークン（本人専用リンク用）
function genToken() { return crypto.randomBytes(18).toString('base64url'); }

function headers(extra) {
  return { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', ...(extra || {}) };
}
async function sb(path, opts = {}) {
  const res = await fetch(BASE + path, { method: opts.method || 'GET', headers: headers(opts.headers), body: opts.body });
  if (!res.ok) { const t = await res.text(); throw new Error(`Supabase ${res.status}: ${t.slice(0, 300)}`); }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}
const pick = (fields, data) => { const o = {}; for (const f of fields) o[f] = data[f] ?? null; return o; };

const CAND_FIELDS = [
  'name','age','nearest_station','commute_range','contact','phone','email',
  'pref_location','pref_days','pref_time','pref_employment',
  'pref_annual_income','pref_monthly_income','change_timing',
  'skill_sales','skill_hospitality','skill_admin','skill_pc','skill_ai','qualifications',
  'career_job','career_industry','goal_3y','goal_5y','future_work','mbti','target_income',
  'val_income','val_growth','val_stability','val_relationship','val_wlb'
];
const JOB_FIELDS = ['company_name','title','employment_type','salary_min','salary_max','location','remote','description','requirements',
  'industry','company_size','company_tags','job_category','work_time','overtime','holidays','benefits',
  'required_experience','required_qualifications','req_aptitude','req_persona','req_values'];
const ORDER = { '登録済':0, '診断済':1, '面談済':2, '採用':3, '保留':3, '紹介可':3 };

async function createCandidate(data, histories) {
  const token = genToken();
  const row = pick(CAND_FIELDS, data); row.status = '登録済'; row.token = token;
  const [c] = await sb('/candidates', { method:'POST', headers:{ Prefer:'return=representation' }, body: JSON.stringify(row) });
  const id = c.id;
  const rows = (Array.isArray(histories) ? histories : []).filter(w => w && (w.industry || w.job_type))
    .map(w => ({ candidate_id:id, industry:w.industry ?? null, job_type:w.job_type ?? null, years:w.years ?? null, achievement:w.achievement ?? null, resignation_reason:w.resignation_reason ?? null }));
  if (rows.length) await sb('/work_histories', { method:'POST', body: JSON.stringify(rows) });
  return { id, token };
}
async function getCandidateIdByToken(token) {
  if (!token) return null;
  const rows = await sb('/candidates?select=id&token=eq.' + encodeURIComponent(token)) || [];
  return rows[0] ? rows[0].id : null;
}

async function listCandidates() {
  const cands = await sb('/candidates?select=id,created_at,status,name,age,nearest_station,contact,career_job,pref_annual_income,iv_date&order=id.desc');
  const trs = await sb('/test_results?select=candidate_id,test_key,score');
  const byC = {};
  for (const t of trs) { (byC[t.candidate_id] = byC[t.candidate_id] || []).push(t); }
  return cands.map(c => {
    const ts = byC[c.id] || [];
    const scores = ts.map(t => t.score).filter(s => s != null);
    return {
      id:c.id, created_at:c.created_at, status:c.status, name:c.name, age:c.age,
      nearest_station:c.nearest_station, contact:c.contact, career_job:c.career_job, pref_annual_income:c.pref_annual_income,
      tests_done: ts.length,
      apt_avg: scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : null,
      knowledge_total: (ts.find(t=>t.test_key==='general')||{}).score ?? null,
      has_interview: c.iv_date ? 1 : null,
    };
  });
}

async function getCandidate(id) {
  const [c] = await sb('/candidates?id=eq.' + id) || [];
  if (!c) return null;
  c.work_histories = await sb('/work_histories?candidate_id=eq.' + id) || [];
  const trs = await sb('/test_results?candidate_id=eq.' + id) || [];
  c.tests = {};
  for (const t of trs) c.tests[t.test_key] = { score:t.score, detail:t.detail || null, taken_at:t.taken_at };
  const a = (await sb('/ai_analysis?candidate_id=eq.' + id) || [])[0];
  c.ai_analysis = a ? { ...a.json, created_at:a.created_at } : null;
  return c;
}

async function updateCandidate(id, fields) {
  const allow = new Set([...CAND_FIELDS, 'status', 'iv_impression','iv_comm','iv_proactive','iv_personality','iv_comment','iv_evaluator','iv_date']);
  const patch = {};
  for (const [k, v] of Object.entries(fields || {})) if (allow.has(k)) patch[k] = v ?? null;
  if (!Object.keys(patch).length) return;
  await sb('/candidates?id=eq.' + id, { method:'PATCH', body: JSON.stringify(patch) });
}

async function bumpStatus(id, next) {
  const [c] = await sb('/candidates?select=status&id=eq.' + id) || [];
  if (!c) return;
  if ((ORDER[next] ?? 0) > (ORDER[c.status] ?? 0)) await updateCandidate(id, { status: next });
}

async function saveTestResult(id, key, result) {
  await sb('/test_results', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates' },
    body: JSON.stringify({ candidate_id:id, test_key:key, score:result.score, detail:result.detail || {}, taken_at:new Date().toISOString() }) });
  if (result.values) await updateCandidate(id, result.values);
  await bumpStatus(id, '診断済');
}

async function saveInterview(id, iv) {
  await updateCandidate(id, {
    iv_impression: iv.iv_impression ?? null, iv_comm: iv.iv_comm ?? null, iv_proactive: iv.iv_proactive ?? null,
    iv_personality: iv.iv_personality ?? null, iv_comment: iv.iv_comment ?? null, iv_evaluator: iv.iv_evaluator ?? null,
    iv_date: new Date().toISOString(),
  });
  await bumpStatus(id, '面談済');
}

async function saveAnalysis(id, analysis) {
  await sb('/ai_analysis', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates' },
    body: JSON.stringify({ candidate_id:id, json:analysis, created_at:new Date().toISOString() }) });
}

async function getStats() {
  const rows = await sb('/candidates?select=val_growth,val_stability,val_relationship,val_wlb') || [];
  const total = rows.length;
  const withApt = (await sb('/test_results?select=candidate_id&test_key=eq.sales') || []).length;
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

async function createJob(data) {
  const [j] = await sb('/jobs', { method:'POST', headers:{ Prefer:'return=representation' }, body: JSON.stringify(pick(JOB_FIELDS, data)) });
  return j.id;
}
async function listJobs() { return await sb('/jobs?select=*&order=id.desc') || []; }
async function getJob(id) { return (await sb('/jobs?id=eq.' + id) || [])[0] || null; }
async function listCandidatesFull() {
  const ids = (await sb('/candidates?select=id&order=id.desc') || []).map(r => r.id);
  const out = [];
  for (const id of ids) out.push(await getCandidate(id));
  return out;
}

module.exports = { createCandidate, getCandidateIdByToken, listCandidates, getCandidate, updateCandidate, saveTestResult, saveInterview, saveAnalysis, getStats, createJob, listJobs, getJob, listCandidatesFull };
