'use strict';
// WORK PASS リクエストハンドラ（ローカルhttpサーバーとVercelサーバーレス関数の両方から使う）
const fs = require('fs');
const path = require('path');
// .env を読み込み（ローカル用・依存ゼロ。Vercelでは環境変数が直接入るので無害）
try {
  const envp = path.join(__dirname, '.env');
  if (fs.existsSync(envp)) for (const line of fs.readFileSync(envp,'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g,'').trim();
  }
} catch {}
const crypto = require('crypto');
const db = require('./db');
const Q = require('./questions');
const ai = require('./gemini');

// ===== 運営（管理者）認証：共有パスワード + 署名付きCookie（サーバーレスでもステートレスに検証）=====
// 署名鍵はハードコードのフォールバックを持たない（未設定なら空→署名/検証とも常に失敗＝fail-close）
function authKey() { return process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || ''; }
function signAdmin() {
  const exp = Date.now() + 1000 * 60 * 60 * 12; // 12時間有効
  const sig = crypto.createHmac('sha256', authKey()).update('admin.' + exp).digest('base64url');
  return 'admin.' + exp + '.' + sig;
}
function verifyAdmin(token) {
  if (!authKey()) return false; // 鍵未設定なら如何なるCookieも無効
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'admin') return false;
  const expected = crypto.createHmac('sha256', authKey()).update('admin.' + parts[1]).digest('base64url');
  const a = Buffer.from(parts[2]), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(parts[1]) > Date.now();
}
function parseCookies(req) {
  const o = {}; const h = req.headers.cookie || '';
  for (const p of h.split(';')) { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
  return o;
}
function isAdmin(req) {
  if (verifyAdmin(parseCookies(req).wp_admin)) return true;
  // ローカル開発のみ素通し。判定は偽装可能なHostヘッダではなく実接続元アドレスで行い、本番(Vercel)では無効化。
  if (!process.env.ADMIN_PASSWORD && !process.env.VERCEL) {
    const ra = (req.socket && req.socket.remoteAddress) || '';
    return ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1';
  }
  return false;
}
// 求職者本人向け応答から、運営専用フィールド（面談評価・AIの内部所見）を除去する
function stripAnalysis(a) {
  if (!a || typeof a !== 'object') return a;
  const o = { ...a }; delete o.concerns; delete o.interview_points; return o;
}
function publicMeView(c) {
  if (!c || typeof c !== 'object') return c;
  const o = { ...c };
  ['iv_impression','iv_comm','iv_proactive','iv_personality','iv_comment','iv_evaluator','iv_date'].forEach(k => delete o[k]);
  if (o.ai_analysis) o.ai_analysis = stripAnalysis(o.ai_analysis);
  return o;
}
function timingEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}
const clampInt = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null; };

// 求職者本人が変更してよい項目（status・面談評価などは含めない）
const SELF_FIELDS = new Set([
  'name','age','nearest_station','commute_range','contact','phone','email',
  'pref_location','pref_days','pref_time','pref_employment',
  'pref_annual_income','pref_monthly_income','change_timing',
  'skill_sales','skill_hospitality','skill_admin','skill_pc','skill_ai','qualifications',
  'career_job','career_industry','goal_3y','goal_5y','future_work','mbti','target_income',
  'val_income','val_growth','val_stability','val_relationship','val_wlb'
]);
function jobMapFor(jobs) {
  const map = {};
  jobs.forEach(j => { map[j.id] = { title:j.title, company_name:j.company_name, salary_min:j.salary_min, salary_max:j.salary_max, location:j.location, remote:j.remote, company_tags:j.company_tags, job_category:j.job_category }; });
  return map;
}
async function respondCandidateMatches(res, c) {
  const jobs = await db.listJobs();
  if (!jobs.length) return send(res, 200, { matches: [], jobs: {}, jobsTotal: 0 });
  try {
    const matches = await ai.matchCandidateToJobs(c, jobs);
    return send(res, 200, { matches, jobs: jobMapFor(jobs), jobsTotal: jobs.length });
  } catch (e) {
    if (e.code === 'NO_KEY') return send(res, 400, { error:'NO_KEY', message:'GEMINI_API_KEY が未設定です。' });
    console.error('[candidate-matches]', e.message, e.detail || '');
    return send(res, 502, { error:'AI_ERROR', message:'求人マッチングに失敗しました。時間をおいて再度お試しください。' });
  }
}
async function respondAnalyze(res, cid, c, publicView) {
  // コスト抑制：既に分析済みなら再度AIを呼ばずキャッシュを返す（本人ルートの連打による課金増を防止）
  if (publicView && c && c.ai_analysis) return send(res, 200, { analysis: stripAnalysis(c.ai_analysis) });
  try {
    const analysis = await ai.analyzeCandidate(c);
    await db.saveAnalysis(cid, analysis);
    return send(res, 200, { analysis: publicView ? stripAnalysis(analysis) : analysis });
  } catch (e) {
    if (e.code === 'NO_KEY') return send(res, 400, { error: 'NO_KEY', message: 'GEMINI_API_KEY が未設定です。' });
    console.error('[analyze]', e.message, e.detail || '');
    return send(res, 502, { error: 'AI_ERROR', message: 'AI分析に失敗しました。時間をおいて再度お試しください。' });
  }
}

const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8' };

// 文字列フィールドの過大入力を防ぐ（AIトークン浪費・DoS対策）。ネストした配列/オブジェクトも再帰的に丸める。
function capStrings(obj, max = 5000) {
  if (typeof obj === 'string') return obj.length > max ? obj.slice(0, max) : obj;
  if (Array.isArray(obj)) return obj.slice(0, 50).map(v => capStrings(v, max));
  if (obj && typeof obj === 'object') { for (const k of Object.keys(obj)) obj[k] = capStrings(obj[k], max); return obj; }
  return obj;
}
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body); // Vercelが解析済みの場合
  return new Promise((resolve) => {
    let d = '', done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    req.on('data', c => { d += c; if (d.length > 2e6) { fin({}); req.destroy(); } });
    req.on('end', () => { try { fin(d ? JSON.parse(d) : {}); } catch { fin({}); } });
    req.on('close', () => fin({}));
    req.on('error', () => fin({}));
  });
}
function serveStatic(res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not Found', 'text/plain; charset=utf-8');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

async function handle(req, res) {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = u.pathname;
  try {
    let m;
    // ===== 運営（管理者）認証 =====
    if (p === '/api/admin/login' && req.method === 'POST') {
      const pw = process.env.ADMIN_PASSWORD || '';
      if (!pw) return send(res, 400, { error: 'ADMIN_PASSWORD が未設定です。管理者ログインを利用するには環境変数を設定してください。' });
      const body = await readBody(req);
      if (typeof body.password !== 'string' || body.password.length > 200 || !timingEqual(body.password, pw)) return send(res, 401, { error: 'パスワードが違います。' });
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `wp_admin=${signAdmin()}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax${secure}`);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/admin/logout' && req.method === 'POST') {
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `wp_admin=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/admin/me' && req.method === 'GET') {
      return isAdmin(req) ? send(res, 200, { ok: true }) : send(res, 401, { error: 'unauthorized' });
    }

    // ===== 求職者本人（推測不可トークン）用エンドポイント =====
    if ((m = p.match(/^\/api\/me\/([A-Za-z0-9_-]{16,64})$/)) && req.method === 'GET') {
      const cid = await db.getCandidateIdByToken(m[1]);
      if (!cid) return send(res, 404, { error: 'not found' });
      return send(res, 200, publicMeView(await db.getCandidate(cid))); // 面談評価など運営専用項目は除去
    }
    if ((m = p.match(/^\/api\/me\/([A-Za-z0-9_-]{16,64})$/)) && (req.method === 'PATCH' || req.method === 'POST')) {
      const cid = await db.getCandidateIdByToken(m[1]);
      if (!cid) return send(res, 404, { error: 'not found' });
      const body = capStrings(await readBody(req));
      const safe = {};
      for (const k of Object.keys(body)) if (SELF_FIELDS.has(k)) safe[k] = body[k];
      if (safe.age != null) safe.age = clampInt(safe.age, 15, 99);
      ['skill_sales','skill_hospitality','skill_admin','skill_pc','skill_ai'].forEach(k => { if (safe[k] != null) safe[k] = clampInt(safe[k], 0, 5); });
      if (safe.pref_annual_income != null) safe.pref_annual_income = clampInt(safe.pref_annual_income, 0, 20000);
      if (safe.pref_monthly_income != null) safe.pref_monthly_income = clampInt(safe.pref_monthly_income, 0, 20000);
      if (safe.target_income != null) safe.target_income = clampInt(safe.target_income, 0, 5000);
      await db.updateCandidate(cid, safe);
      return send(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/me\/([A-Za-z0-9_-]{16,64})\/tests\/([a-z]+)$/)) && req.method === 'POST') {
      const cid = await db.getCandidateIdByToken(m[1]);
      if (!cid) return send(res, 404, { error: 'not found' });
      const body = capStrings(await readBody(req));
      const result = Q.scoreTest(m[2], body.answers);
      if (!result) return send(res, 404, { error: 'unknown test' });
      await db.saveTestResult(cid, m[2], result);
      return send(res, 200, { result });
    }
    if ((m = p.match(/^\/api\/me\/([A-Za-z0-9_-]{16,64})\/matches$/)) && req.method === 'POST') {
      const cid = await db.getCandidateIdByToken(m[1]);
      if (!cid) return send(res, 404, { error: 'not found' });
      return respondCandidateMatches(res, await db.getCandidate(cid));
    }
    if ((m = p.match(/^\/api\/me\/([A-Za-z0-9_-]{16,64})\/analyze$/)) && req.method === 'POST') {
      const cid = await db.getCandidateIdByToken(m[1]);
      if (!cid) return send(res, 404, { error: 'not found' });
      return respondAnalyze(res, cid, await db.getCandidate(cid), true); // 本人向け：内部所見を除去＋キャッシュ優先
    }

    // ===== 運営専用（要ログイン） =====
    if (p === '/api/candidates' && req.method === 'GET') { if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' }); return send(res, 200, await db.listCandidates()); }
    if (p === '/api/stats' && req.method === 'GET') { if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' }); return send(res, 200, await db.getStats()); }
    if (p === '/api/candidates' && req.method === 'POST') {
      const body = capStrings(await readBody(req));
      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) return send(res, 400, { error: '氏名は必須です' });
      if (body.age != null) body.age = clampInt(body.age, 15, 99);
      ['skill_sales','skill_hospitality','skill_admin','skill_pc','skill_ai'].forEach(k => { if (body[k] != null) body[k] = clampInt(body[k], 0, 5); });
      if (body.pref_annual_income != null) body.pref_annual_income = clampInt(body.pref_annual_income, 0, 20000);
      if (body.pref_monthly_income != null) body.pref_monthly_income = clampInt(body.pref_monthly_income, 0, 20000);
      if (body.target_income != null) body.target_income = clampInt(body.target_income, 0, 5000);
      const created = await db.createCandidate(body, body.work_histories); // { id, token }
      return send(res, 200, created);
    }
    if ((m = p.match(/^\/api\/candidates\/(\d+)$/)) && req.method === 'GET') {
      if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
      const c = await db.getCandidate(Number(m[1]));
      return c ? send(res, 200, c) : send(res, 404, { error: 'not found' });
    }
    if ((m = p.match(/^\/api\/candidates\/(\d+)$/)) && (req.method === 'PATCH' || req.method === 'POST')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
      const body = capStrings(await readBody(req));
      const STATUSES = ['登録済','診断済','面談済','紹介可','採用','保留'];
      if (body.status != null && !STATUSES.includes(body.status)) return send(res, 400, { error: '不正なステータスです' });
      await db.updateCandidate(Number(m[1]), body);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/tests' && req.method === 'GET') return send(res, 200, Q.testMeta());
    if ((m = p.match(/^\/api\/tests\/([a-z]+)$/)) && req.method === 'GET') {
      const t = Q.testForClient(m[1]);
      return t ? send(res, 200, t) : send(res, 404, { error: 'unknown test' });
    }
    if ((m = p.match(/^\/api\/candidates\/(\d+)\/tests\/([a-z]+)$/)) && req.method === 'POST') {
      if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
      const body = capStrings(await readBody(req));
      const result = Q.scoreTest(m[2], body.answers);
      if (!result) return send(res, 404, { error: 'unknown test' });
      await db.saveTestResult(Number(m[1]), m[2], result);
      return send(res, 200, { result });
    }
    if ((m = p.match(/^\/api\/candidates\/(\d+)\/interview$/)) && req.method === 'POST') {
      if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      await db.saveInterview(Number(m[1]), body);
      return send(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/candidates\/(\d+)\/analyze$/)) && req.method === 'POST') {
      if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
      const id = Number(m[1]);
      const c = await db.getCandidate(id);
      if (!c) return send(res, 404, { error: 'not found' });
      return respondAnalyze(res, id, c);
    }
    if (p === '/api/ai/status' && req.method === 'GET') return send(res, 200, { enabled: ai.hasKey(), model: ai.MODEL });
    // 運営：求職者 → おすすめ求人（1求職者×全求人をAIで相性順に）
    if ((m = p.match(/^\/api\/candidates\/(\d+)\/matches$/)) && req.method === 'POST') {
      if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
      const c = await db.getCandidate(Number(m[1]));
      if (!c) return send(res, 404, { error: 'not found' });
      return respondCandidateMatches(res, c);
    }
    if (p === '/api/jobs' && req.method === 'GET') { if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' }); return send(res, 200, await db.listJobs()); }
    if (p === '/api/jobs' && req.method === 'POST') {
      if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
      const body = capStrings(await readBody(req));
      if (!body.title || !String(body.title).trim()) return send(res, 400, { error: '求人職種は必須です' });
      if (body.salary_min != null && body.salary_min !== '') body.salary_min = clampInt(body.salary_min, 0, 5000);
      if (body.salary_max != null && body.salary_max !== '') body.salary_max = clampInt(body.salary_max, 0, 5000);
      const smin = Number(body.salary_min), smax = Number(body.salary_max);
      if (Number.isFinite(smin) && Number.isFinite(smax) && smin > smax) return send(res, 400, { error: '年収の下限が上限を超えています' });
      const id = await db.createJob(body);
      return send(res, 200, { id });
    }
    if ((m = p.match(/^\/api\/jobs\/(\d+)$/)) && req.method === 'GET') {
      if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
      const j = await db.getJob(Number(m[1]));
      return j ? send(res, 200, j) : send(res, 404, { error: 'not found' });
    }
    if ((m = p.match(/^\/api\/jobs\/(\d+)\/match$/)) && req.method === 'POST') {
      if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
      const job = await db.getJob(Number(m[1]));
      if (!job) return send(res, 404, { error: 'not found' });
      const cands = await db.listCandidatesFull();
      if (!cands.length) return send(res, 200, { matches: [], candidates: {} });
      try {
        const matches = await ai.matchJobToCandidates(job, cands);
        const map = {}; cands.forEach(c => { map[c.id] = { name:c.name, career_job:c.career_job, pref_annual_income:c.pref_annual_income, status:c.status }; });
        return send(res, 200, { matches, candidates: map });
      } catch (e) {
        if (e.code === 'NO_KEY') return send(res, 400, { error:'NO_KEY', message:'GEMINI_API_KEY が未設定です。' });
        console.error('[match]', e.message, e.detail || '');
        return send(res, 502, { error:'AI_ERROR', message:'AIマッチングに失敗しました。時間をおいて再度お試しください。' });
      }
    }
    // 静的ファイル（ローカル用。Vercelでは public/ が直接配信されるため通常ここには来ない）
    if (req.method === 'GET') return serveStatic(res, p);
    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error('[500]', e && (e.message || e), e && e.detail || '');
    return send(res, 500, { error: 'サーバーエラーが発生しました。時間をおいて再度お試しください。' });
  }
}

module.exports = { handle };
