import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** DSH v4 会话是多个 zstd 帧拼接；逐帧解压后合并为 JSONL 文本。 */
export function decodeZstdFrames(file) {
  const raw = fs.readFileSync(file);
  const starts = [];
  for (let i = 0; i + 3 < raw.length; i++) {
    if (raw[i] === 0x28 && raw[i + 1] === 0xb5 && raw[i + 2] === 0x2f && raw[i + 3] === 0xfd) starts.push(i);
  }
  const chunks = [];
  let pending = null;
  for (let k = 0; k < starts.length; k++) {
    const start = pending ?? starts[k];
    const end = k + 1 < starts.length ? starts[k + 1] : raw.length;
    try {
      chunks.push(zlib.zstdDecompressSync(raw.subarray(start, end)));
      pending = null;
    } catch {
      pending = start;
    }
  }
  if (pending !== null) {
    try { chunks.push(zlib.zstdDecompressSync(raw.subarray(pending))); } catch { /* 截断帧，跳过 */ }
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseEvents(file) {
  const text = decodeZstdFrames(file);
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* 损坏行跳过 */ }
  }
  return events;
}

export function textFromContent(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter((p) => p && (p.type === 'text' || typeof p.text === 'string'))
    .map((p) => p.text || '')
    .join('\n')
    .trim();
}

export function countNonTextParts(content) {
  if (!Array.isArray(content)) return 0;
  return content.filter((p) => p && p.type !== 'text').length;
}

function normPath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function classify(header, config) {
  const id = header.id;
  const cwd = header.cwd || '';
  const legacyIds = new Set((config.sources?.qq?.legacySessionIds || []).map(String));
  const qqRoots = (config.sources?.qq?.workspaceRoots || []).map(normPath);
  const legacy = legacyIds.has(id);
  const inQqRoot = qqRoots.some((root) => root && (normPath(cwd) === root || normPath(cwd).startsWith(root + '/')));
  const channel = legacy ? 'qq_legacy' : inQqRoot ? 'qq' : 'dsh';
  return { channel, legacy, inQqRoot };
}

export function normalizeSession(file, config, root) {
  const events = parseEvents(file);
  if (!events.length) return null;
  const header = events.find((e) => e.type === 'session');
  if (!header) return null;

  let title = '';
  const messages = [];
  let userCount = 0;
  let assistantCount = 0;
  let chars = 0;
  let attachments = 0;
  let toolCalls = 0;
  let lastTime = null;

  for (const o of events) {
    if (o.type === 'session/title' && o.data?.title) title = String(o.data.title);
    if (o.time) {
      const t = typeof o.time === 'number' ? o.time : Date.parse(o.time);
      if (Number.isFinite(t) && (!lastTime || t > lastTime)) lastTime = t;
    }
    if (o.type === 'user/message' && o.data?.source?.kind === 'user') {
      const text = textFromContent(o.data.content);
      if (!text) continue;
      userCount++;
      chars += text.length;
      attachments += countNonTextParts(o.data.content);
      messages.push({
        role: 'user',
        time: o.time ?? null,
        seq: o.seq ?? null,
        text,
        mediaCount: countNonTextParts(o.data.content)
      });
    } else if (o.type === 'assistant/message') {
      const text = textFromContent(o.data?.message?.content);
      if (!text) continue;
      assistantCount++;
      chars += text.length;
      messages.push({
        role: 'assistant',
        time: o.time ?? null,
        seq: o.seq ?? null,
        text
      });
    } else if (o.type === 'tool/call') {
      toolCalls++;
    }
  }

  if (!messages.length) return null;
  messages.sort((a, b) => (a.time || 0) - (b.time || 0) || (a.seq || 0) - (b.seq || 0));

  const { channel, legacy } = classify(header, config);
  const cwd = header.cwd || '';
  const workspace = cwd ? path.basename(cwd) || cwd : '(unknown)';
  const createdAt = header.createdAt ?? (messages[0]?.time || null);
  return {
    source: 'dsh',
    channel,
    legacy,
    main: !header.parentSession,
    parentSession: header.parentSession || null,
    delegationDepth: header.delegationDepth ?? null,
    sessionId: header.id,
    agentPreset: header.agentPreset || null,
    cwd,
    workspace,
    title,
    createdAt,
    endedAt: lastTime,
    userCount,
    assistantCount,
    chars,
    attachments,
    toolCalls,
    messages,
    sourceFile: path.relative(root, file).replace(/\\/g, '/')
  };
}

export function readSessions(root, config) {
  const files = [];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.zstd')) files.push(p);
    }
  })(root);

  const sessions = [];
  const errors = [];
  for (const file of files) {
    try {
      const s = normalizeSession(file, config, root);
      if (s) sessions.push(s);
    } catch (err) {
      errors.push({ file: path.relative(root, file), error: String(err?.message || err) });
    }
  }
  sessions.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return { sessions, errors };
}
