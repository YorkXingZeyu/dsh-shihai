import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildData } from './data.mjs';
import { readSessions } from '../tools/lib/session.mjs';

const here = fileURLToPath(import.meta.url);
const viewRoot = path.dirname(here);
const vault = path.resolve(viewRoot, '..');
const configFile = path.join(vault, 'config', 'sources.json');
const port = Number(process.env.SHIHAI_VIEW_PORT || 4177);
const host = '127.0.0.1';
const liveFile = path.join(vault, '.private', 'live', 'events.jsonl');
const indexFile = path.join(vault, '90_元数据', 'notes.index.json');
const interactionsFile = path.join(vault, '.private', 'interactions.index.json');
const layoutFile = path.join(vault, '90_元数据', 'layout.json');
let lastInteractionMtime = 0;
let lastLayoutMtime = 0;
try { lastInteractionMtime = fs.statSync(interactionsFile).mtimeMs; } catch {}
try { lastLayoutMtime = fs.statSync(layoutFile).mtimeMs; } catch {}
const liveClients = new Set();
let lastIndexMtime = 0;
try { lastIndexMtime = fs.statSync(indexFile).mtimeMs; } catch {}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(body));
  });
}
function qqGroups() {
  const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const { sessions } = readSessions(cfg.sourceRoot, cfg);
  const groups = sessions
    .filter((s) => s.channel === 'qq' && s.messages.some((m) => /^\s*\[[^\]]+\]/.test(String(m.text || ''))))
    .map((s) => {
      const users = s.messages.filter((m) => m.role === 'user');
      const ids = new Set();
      for (const m of users) { const hit = String(m.text || '').match(/^\s*\[[^\]]+?\(([0-9A-Za-z]+)\)\]/); if (hit) ids.add(hit[1]); }
      return {
        sessionId: s.sessionId,
        short: s.sessionId.slice(0, 8),
        label: s.title || 'QQ 群',
        userMessages: users.length,
        members: ids.size,
        lastAt: users.length ? users[users.length - 1].time : null,
        allMessages: cfg.sources?.qq?.groupPolicies?.[s.sessionId]?.allMessages === true
      };
    })
    .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
  return {
    groups,
    defaultPolicy: cfg.sources?.qq?.groupDefault || { allMessages: false, mentionOnly: true },
    updatedAt: new Date().toISOString()
  };
}

function send(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/api/live') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(': connected\n\n');
    let offset = 0;
    try { offset = fs.statSync(liveFile).size; } catch {}
    const client = { res, offset, alive: true };
    liveClients.add(client);
    req.on('close', () => { client.alive = false; liveClients.delete(client); });
    return;
  }
  if (pathname === '/api/qq/groups') {
    try { return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(qqGroups())); }
    catch (err) { return send(res, 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: String(err?.message || err) })); }
  }
  if (pathname === '/api/qq/policy' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const sessionId = String(body.sessionId || '').trim();
      if (!/^[0-9a-f-]{8,}$/i.test(sessionId)) return send(res, 400, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: 'sessionId 不合法' }));
      const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      cfg.sources.qq.groupPolicies ||= {};
      if (body.allMessages === true) {
        cfg.sources.qq.groupPolicies[sessionId] = { allMessages: true, label: String(body.label || '指定群') };
      } else {
        cfg.sources.qq.groupPolicies[sessionId] = { allMessages: false };
      }
      fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2), 'utf8');
      const child = spawn(process.execPath, [path.join(vault, 'tools', 'sync-qq-memory.mjs')], {
        cwd: vault, detached: true, stdio: 'ignore', windowsHide: true
      });
      child.unref();
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, ...qqGroups() }));
    } catch (err) {
      return send(res, 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: String(err?.message || err) }));
    }
  }
  if (pathname === '/群策略.html') {
    try { return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(viewRoot, '群策略.html'), 'utf8')); }
    catch { return send(res, 404, 'text/plain; charset=utf-8', '群策略页面不存在'); }
  }
  if (pathname === '/api/layout/rebuild' && req.method === 'POST') {
    try {
      const child = spawn(process.execPath, [path.join(vault, 'tools', 'build-layout.mjs'), '--full'], { cwd: vault, detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, mode: 'full' }));
    } catch (err) {
      return send(res, 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: err.message }));
    }
  }
  if (pathname === '/api/memory' || pathname === '/api/health') {
    try {
      if (pathname === '/api/health') {
        return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, mode: 'live', time: new Date().toISOString() }));
      }
      const data = buildData(vault);
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(data));
    } catch (err) {
      return send(res, 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: String(err?.message || err) }));
    }
  }
  if (pathname === '/' || pathname === '/index.html') {
    try {
      const html = fs.readFileSync(path.join(viewRoot, 'index.html'), 'utf8');
      return send(res, 200, 'text/html; charset=utf-8', html);
    } catch (err) {
      return send(res, 500, 'text/plain; charset=utf-8', '识海视图尚未构建，请先运行 node build.mjs');
    }
  }
  if (pathname === '/数据快照.json') {
    try {
      const json = fs.readFileSync(path.join(viewRoot, '数据快照.json'), 'utf8');
      return send(res, 200, 'application/json; charset=utf-8', json);
    } catch { /* fallthrough */ }
  }
  send(res, 404, 'text/plain; charset=utf-8', 'Not found');
});

setInterval(() => {
  let size = 0;
  try { size = fs.statSync(liveFile).size; } catch {}
  for (const client of liveClients) {
    if (!client.alive) continue;
    if (size < client.offset) client.offset = 0;
    if (size <= client.offset) continue;
    try {
      const fd = fs.openSync(liveFile, 'r');
      const len = size - client.offset;
      const buf = Buffer.alloc(Math.min(len, 65536));
      fs.readSync(fd, buf, 0, buf.length, client.offset);
      fs.closeSync(fd);
      client.offset += buf.length;
      const text = buf.toString('utf8');
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try { JSON.parse(line); } catch { continue; }
        client.res.write(`event: interaction\ndata: ${line}\n\n`);
      }
    } catch { /* file rotated / read race */ }
  }
  let mtime = 0;
  try { mtime = fs.statSync(indexFile).mtimeMs; } catch {}
  let imtime = 0;
  try { imtime = fs.statSync(interactionsFile).mtimeMs; } catch {}
  let ltime = 0;
  try { ltime = fs.statSync(layoutFile).mtimeMs; } catch {}
  if ((mtime && mtime !== lastIndexMtime) || (imtime && imtime !== lastInteractionMtime) || (ltime && ltime !== lastLayoutMtime)) {
    lastIndexMtime = mtime || lastIndexMtime;
    lastInteractionMtime = imtime || lastInteractionMtime;
    lastLayoutMtime = ltime || lastLayoutMtime;
    for (const client of liveClients) {
      if (client.alive) client.res.write(`event: memory\ndata: {"mtime":${mtime}}\n\n`);
    }
  }
}, 400);

setInterval(() => {
  for (const client of liveClients) {
    if (client.alive) { try { client.res.write(': ping\n\n'); } catch {} }
  }
}, 15000);

server.listen(port, host, () => {
  console.log(`识海 · 实时模式  http://${host}:${port}/`);
  console.log(`数据：${vault}`);
  console.log('窗口保持打开；关闭窗口或 Ctrl+C 停止服务。');
});
