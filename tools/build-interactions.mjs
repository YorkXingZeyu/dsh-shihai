import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readSessions } from './lib/session.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(base, 'config', 'sources.json'), 'utf8'));
const idx = JSON.parse(fs.readFileSync(path.join(base, '90_元数据', 'notes.index.json'), 'utf8'));
const queuePath = path.join(base, '.private', 'candidates', 'queue.json');
const queue = fs.existsSync(queuePath) ? JSON.parse(fs.readFileSync(queuePath, 'utf8')) : { candidates: [] };
const { sessions } = readSessions(cfg.sourceRoot, cfg);
const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);
const localDate = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
const clean = (raw) => {
  const m = String(raw).match(/^\s*\[([^\]]+?)\s+\([0-9A-Za-z]+\)\]\s*([\s\S]*)$/);
  return {
    speaker: m ? m[1].trim() : '',
    text: (m ? m[2] : String(raw)).replace(/\(@you\)|@you/gi, '').replace(/\s+/g, ' ').trim(),
    group: !!m
  };
};
const cleanProject = (s) => String(s || '').replace(/\s*\(cwd:.*$/i, '').replace(/\s*[（(][^）)]*[）)]\s*$/g, '').trim();
const alias = (s) => cleanProject(s);
const inferProject = (text, s) => {
  if (s.channel === 'qq') return clean(text).group || /群/.test(s.title || '') ? 'QQ 群互动' : 'QQ 私聊互动';
  return alias(s.title || '') || alias(s.workspace || '') || '未归类';
};
const noteBySeq = new Map();
for (const n of idx.notes) {
  for (const seq of n.source?.messages || []) {
    const key = (n.source?.session || '') + ':' + seq;
    if (!noteBySeq.has(key)) noteBySeq.set(key, []);
    noteBySeq.get(key).push(n);
  }
}
const candidateBySeq = new Map();
for (const c of queue.candidates || []) {
  if (!c.sessionId || c.seq == null) continue;
  const key = c.sessionId + ':' + c.seq;
  if (!candidateBySeq.has(key)) candidateBySeq.set(key, []);
  candidateBySeq.get(key).push({ cid: c.cid, status: c.status });
}
const interactions = [];
for (const s of sessions) {
  if (s.parentSession) continue;
  let current = null;
  const flush = () => {
    if (!current) return;
    const c = clean(current.user.text);
    if (!c.text) return;
    const formal = noteBySeq.get(s.sessionId + ':' + current.user.seq) || [];
    const candidates = candidateBySeq.get(s.sessionId + ':' + current.user.seq) || [];
    const project = formal.find((n) => n.project)?.project || inferProject(c.text, s);
    const cluster = alias(project) || '闲聊/未归类';
    const assistantText = current.assistants
      .map((a) => String(a.text || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(-1)[0] || '';
    const kind = /^(你好|在吗|继续|好的|嗯|收到|开始吧|可以)$/.test(c.text)
      ? 'chat'
      : /决定|不要|必须|约定|以后|记住/.test(c.text)
        ? 'decision'
        : /喜欢|不喜欢|偏好|更愿意/.test(c.text)
          ? 'preference'
          : /怎么|为什么|是什么|多少|哪里|吗[？?]?$/.test(c.text)
            ? 'question'
            : 'task';
    const importance = Math.max(.18, Math.min(.95,
      .28 + Math.min(.28, c.text.length / 900) + (formal.length ? .18 : 0) + (kind === 'decision' || kind === 'preference' ? .12 : 0) + (candidates.some((x) => x.status === 'pending') ? .04 : 0)
    ));
    interactions.push({
      id: 'it_' + hash(s.sessionId + ':' + current.user.seq),
      time: current.user.time || s.createdAt,
      date: localDate(current.user.time || s.createdAt),
      channel: s.channel,
      session: s.sessionId,
      seq: current.user.seq,
      assistantSeqs: current.assistants.map((a) => a.seq),
      title: s.title || '',
      project,
      cluster,
      kind,
      importance: Number(importance.toFixed(3)),
      user: c.text.slice(0, 180),
      assistant: assistantText.slice(0, 220),
      formalRefs: formal.map((n) => n.id),
      candidateRefs: candidates,
      hasAssistant: current.assistants.length > 0
    });
    current = null;
  };
  for (const m of s.messages) {
    if (m.role === 'user') {
      flush();
      current = { user: m, assistants: [] };
    } else if (m.role === 'assistant' && current) {
      current.assistants.push(m);
    }
  }
  flush();
}
const out = { generatedAt: new Date().toISOString(), total: interactions.length, interactions };
const outDir = path.join(base, '.private');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'interactions.index.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({ total: interactions.length, formalLinked: interactions.filter((x) => x.formalRefs.length).length, candidate: interactions.filter((x) => x.candidateRefs.length).length }, null, 2));
try {
  const { spawn } = await import('node:child_process');
  const py = process.env.PYTHON || 'python';
  const emb = spawn(py, [path.join(base, 'tools', 'embed-docs.py')], { cwd: base, stdio: 'ignore', windowsHide: true });
  emb.on('close', () => {
    try {
      const child = spawn(process.execPath, [path.join(base, 'tools', 'build-layout.mjs')], { cwd: base, detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
    } catch {}
  });
} catch {}
