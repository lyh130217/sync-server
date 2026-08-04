#!/usr/bin/env node
/*
 * 龙飞工作台 · 同步后端 + 静态托管（零依赖，仅用 Node 内置模块）
 * ----------------------------------------------------------------
 * 运行：
 *   node server.js
 *   PORT=3000 node server.js                       # 平台一般用 PORT 环境变量
 *   DATA_DIR=/data PUBLIC_DIR=/app/public node server.js
 *
 * 存储： <DATA_DIR>/<project>.json  （每个项目一个文件，口令 sha256+salt 校验）
 *
 * 接口（与已有前端兼容）：
 *   GET  /api/:project?pass=xxx        -> { revs, data }
 *   POST /api/:project  body {pass, revs, data} -> { revs, data }
 *        （按集合 rev 逐集合 last-writer-wins 合并）
 *   GET  /api/health                   -> { ok:true }
 *
 * 静态： 非 /api/ 路径托管 <PUBLIC_DIR> 下的文件，缺省回退到 index.html
 *        把工作台前端放进 PUBLIC_DIR 即可让「一个链接既打开页面又做同步」。
 *
 * 安全： 仅做口令校验；数据以明文 JSON 存于 DATA_DIR。
 *        公网部署务必加一层保护（反向代理 Basic Auth / 仅内网 / VPN），勿裸奔。
 */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 8787;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, 'public');
[DATA_DIR, PUBLIC_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const COLLECTIONS = ['todos', 'plans', 'pomo', 'accs', 'water', 'inspects', 'works', 'dailys', 'theme'];

function safeProject(name) {
  return String(name || '').replace(/[^a-zA-Z0-9_\-一-龥]/g, '_').slice(0, 64) || 'default';
}
function fileOf(p) { return path.join(DATA_DIR, safeProject(p) + '.json'); }
function passFileOf(p) { return path.join(DATA_DIR, safeProject(p) + '.pass'); }
function sha(salt, pass) { return crypto.createHash('sha256').update(salt + '|' + pass).digest('hex'); }
function loadProject(p) { try { return JSON.parse(fs.readFileSync(fileOf(p), 'utf8')); } catch (e) { return null; } }
function saveProject(p, obj) { fs.writeFileSync(fileOf(p), JSON.stringify(obj, null, 2)); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 5e6) req.destroy(); });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}
function checkPass(p, pass) {
  const pf = passFileOf(p);
  if (!fs.existsSync(pf)) return { ok: true, first: true }; // 首次连接即设定口令
  try { const { salt, hash } = JSON.parse(fs.readFileSync(pf, 'utf8')); return { ok: sha(salt, pass) === hash }; }
  catch (e) { return { ok: false }; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

function sendJSON(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(obj));
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/index.html';
  const fp = path.normalize(path.join(PUBLIC_DIR, p));
  if (!fp.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(fp, (err, buf) => {
    if (err) {
      // SPA 回退：找不到文件就返回首页
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, b2) => {
        if (e2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(b2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' }); res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') { sendJSON(res, 204, {}); return; }

    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/health') { sendJSON(res, 200, { ok: true }); return; }
      const m = url.pathname.match(/^\/api\/([^/]+)$/);
      if (!m) { sendJSON(res, 404, { error: 'not found' }); return; }
      const project = decodeURIComponent(m[1]);

      if (req.method === 'GET') {
        const pass = url.searchParams.get('pass') || '';
        const auth = checkPass(project, pass);
        if (!auth.ok) { sendJSON(res, 403, { error: '口令错误' }); return; }
        const data = loadProject(project) || { revs: {}, data: {} };
        sendJSON(res, 200, data); return;
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        let payload;
        try { payload = JSON.parse(body || '{}'); } catch (e) { sendJSON(res, 400, { error: 'bad json' }); return; }
        const pass = payload.pass || '';
        const auth = checkPass(project, pass);
        if (!auth.ok) { sendJSON(res, 403, { error: '口令错误' }); return; }
        if (auth.first) {
          const salt = crypto.randomBytes(8).toString('hex');
          fs.writeFileSync(passFileOf(project), JSON.stringify({ salt, hash: sha(salt, pass) }));
        }
        const incoming = payload.data || {};
        const incomingRevs = payload.revs || {};
        const proj = loadProject(project) || { revs: {}, data: {} };
        for (const k of COLLECTIONS) {
          if (!(k in proj.revs)) proj.revs[k] = 0;
          if (k in incoming && (incomingRevs[k] || 0) > (proj.revs[k] || 0)) {
            proj.data[k] = incoming[k];
            proj.revs[k] = incomingRevs[k];
          }
        }
        saveProject(project, proj);
        sendJSON(res, 200, proj); return;
      }
      sendJSON(res, 405, { error: 'method not allowed' }); return;
    }

    // 非 API 路径 -> 静态文件
    serveStatic(req, res, url);
  } catch (e) {
    sendJSON(res, 500, { error: String((e && e.message) || e) });
  }
});

server.on('error', (e) => { console.error('服务启动失败:', e.message); process.exit(1); });
server.listen(PORT, () => {
  console.log(`龙飞工作台服务端已启动  端口 ${PORT}  静态目录 ${PUBLIC_DIR}  数据目录 ${DATA_DIR}`);
});
