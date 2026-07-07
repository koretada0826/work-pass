'use strict';
// WORK PASS 人材DB - 依存ゼロ HTTPサーバー
const http = require('http');
const fs = require('fs');
const path = require('path');
// .env を読み込み（依存ゼロの簡易ローダー）
try {
  const envp = path.join(__dirname, '.env');
  if (fs.existsSync(envp)) for (const line of fs.readFileSync(envp,'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g,'').trim();
  }
} catch {}
const db = require('./db');
const Q = require('./questions');
const ai = require('./gemini');

const PORT = process.env.PORT || 4000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
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

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const p = u.pathname;
  try {
    // ---- API ----
    if (p === '/api/candidates' && req.method === 'GET') {
      return send(res, 200, db.listCandidates());
    }
    if (p === '/api/stats' && req.method === 'GET') {
      return send(res, 200, db.getStats());
    }
    if (p === '/api/candidates' && req.method === 'POST') {
      const body = await readBody(req);
      // サーバー側バリデーション（API直叩き対策）
      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) return send(res, 400, { error: '氏名は必須です' });
      const clampInt = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null; };
      if (body.age != null) body.age = clampInt(body.age, 15, 99);
      ['skill_sales','skill_hospitality','skill_admin','skill_pc','skill_ai'].forEach(k => { if (body[k] != null) body[k] = clampInt(body[k], 0, 5); });
      if (body.pref_annual_income != null) body.pref_annual_income = clampInt(body.pref_annual_income, 0, 100000);
      if (body.pref_monthly_income != null) body.pref_monthly_income = clampInt(body.pref_monthly_income, 0, 100000);
      const id = db.createCandidate(body, body.work_histories);
      return send(res, 200, { id });
    }
    let m;
    if ((m = p.match(/^\/api\/candidates\/(\d+)$/)) && req.method === 'GET') {
      const c = db.getCandidate(Number(m[1]));
      return c ? send(res, 200, c) : send(res, 404, { error: 'not found' });
    }
    if ((m = p.match(/^\/api\/candidates\/(\d+)$/)) && (req.method === 'PATCH' || req.method === 'POST')) {
      const body = await readBody(req);
      db.updateCandidate(Number(m[1]), body);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/tests' && req.method === 'GET') {
      return send(res, 200, Q.testMeta());
    }
    if ((m = p.match(/^\/api\/tests\/([a-z]+)$/)) && req.method === 'GET') {
      const t = Q.testForClient(m[1]);
      return t ? send(res, 200, t) : send(res, 404, { error: 'unknown test' });
    }
    if ((m = p.match(/^\/api\/candidates\/(\d+)\/tests\/([a-z]+)$/)) && req.method === 'POST') {
      const body = await readBody(req);
      const result = Q.scoreTest(m[2], body.answers);
      if (!result) return send(res, 404, { error: 'unknown test' });
      db.saveTestResult(Number(m[1]), m[2], result);
      return send(res, 200, { result });
    }
    if ((m = p.match(/^\/api\/candidates\/(\d+)\/interview$/)) && req.method === 'POST') {
      const body = await readBody(req);
      db.saveInterview(Number(m[1]), body);
      return send(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/candidates\/(\d+)\/analyze$/)) && req.method === 'POST') {
      const id = Number(m[1]);
      const c = db.getCandidate(id);
      if (!c) return send(res, 404, { error: 'not found' });
      try {
        const analysis = await ai.analyzeCandidate(c);
        db.saveAnalysis(id, analysis);
        return send(res, 200, { analysis });
      } catch (e) {
        if (e.code === 'NO_KEY') return send(res, 400, { error: 'NO_KEY', message: 'GEMINI_API_KEY が未設定です。workpass/.env に設定してください。' });
        console.error('[analyze]', e.message, e.detail || '');
        return send(res, 502, { error: 'AI_ERROR', message: 'AI分析に失敗しました。時間をおいて再度お試しください。' });
      }
    }
    if (p === '/api/ai/status' && req.method === 'GET') {
      return send(res, 200, { enabled: ai.hasKey(), model: ai.MODEL });
    }
    // 求人
    if (p === '/api/jobs' && req.method === 'GET') return send(res, 200, db.listJobs());
    if (p === '/api/jobs' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.title || !String(body.title).trim()) return send(res, 400, { error: '求人職種は必須です' });
      const smin = Number(body.salary_min), smax = Number(body.salary_max);
      if (Number.isFinite(smin) && Number.isFinite(smax) && smin > smax) return send(res, 400, { error: '年収の下限が上限を超えています' });
      const id = db.createJob(body);
      return send(res, 200, { id });
    }
    if ((m = p.match(/^\/api\/jobs\/(\d+)$/)) && req.method === 'GET') {
      const j = db.getJob(Number(m[1]));
      return j ? send(res, 200, j) : send(res, 404, { error: 'not found' });
    }
    // 求人×全求職者 のAIマッチング
    if ((m = p.match(/^\/api\/jobs\/(\d+)\/match$/)) && req.method === 'POST') {
      const job = db.getJob(Number(m[1]));
      if (!job) return send(res, 404, { error: 'not found' });
      const cands = db.listCandidatesFull();
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
    // ---- 静的ファイル ----
    if (req.method === 'GET') return serveStatic(res, p);
    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: String(e && e.message || e) });
  }
});

// ローカル専用：ループバックのみにバインド（LAN上の他端末からPIIを見せない）
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  WORK PASS 人材DB 起動 →  http://localhost:${PORT}\n  （127.0.0.1のみ・停止： Ctrl + C ）\n`);
});
