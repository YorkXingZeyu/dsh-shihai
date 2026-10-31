import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSessions } from './lib/session.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, '..');
const config = JSON.parse(fs.readFileSync(path.join(base, 'config', 'sources.json'), 'utf8'));
const root = process.argv[2] || config.sourceRoot;
const outDir = path.join(base, '.private', 'raw');
fs.mkdirSync(outDir, { recursive: true });

const { sessions, errors } = readSessions(root, config);

const sessionsFile = path.join(outDir, 'sessions.jsonl');
fs.writeFileSync(sessionsFile, sessions.map((s) => JSON.stringify(s)).join('\n') + (sessions.length ? '\n' : ''), 'utf8');

const index = {
  generatedAt: new Date().toISOString(),
  sourceRoot: root,
  sessionCount: sessions.length,
  errors,
  sessions: sessions.map((s) => ({
    sessionId: s.sessionId,
    channel: s.channel,
    legacy: s.legacy,
    main: s.main,
    parentSession: s.parentSession,
    cwd: s.cwd,
    workspace: s.workspace,
    title: s.title,
    createdAt: s.createdAt,
    endedAt: s.endedAt,
    userCount: s.userCount,
    assistantCount: s.assistantCount,
    chars: s.chars,
    attachments: s.attachments,
    toolCalls: s.toolCalls,
    sourceFile: s.sourceFile
  }))
};
fs.writeFileSync(path.join(outDir, 'sessions.index.json'), JSON.stringify(index, null, 2), 'utf8');

const byChannel = {};
const byWorkspace = new Map();
let userMessages = 0;
let assistantMessages = 0;
let chars = 0;
let mainCount = 0;
let legacyCount = 0;
for (const s of sessions) {
  byChannel[s.channel] = (byChannel[s.channel] || 0) + 1;
  if (s.main) mainCount++;
  if (s.legacy) legacyCount++;
  userMessages += s.userCount;
  assistantMessages += s.assistantCount;
  chars += s.chars;
  const w = byWorkspace.get(s.workspace) || { workspace: s.workspace, cwd: s.cwd, sessions: 0, user: 0, assistant: 0 };
  w.sessions++; w.user += s.userCount; w.assistant += s.assistantCount;
  byWorkspace.set(s.workspace, w);
}

console.log(JSON.stringify({
  sourceRoot: root,
  sessionCount: sessions.length,
  mainSessions: mainCount,
  legacyQqSessions: legacyCount,
  userMessages,
  assistantMessages,
  chars,
  byChannel,
  workspaces: [...byWorkspace.values()].sort((a, b) => b.sessions - a.sessions),
  errors
}, null, 2));
console.log('wrote ' + sessionsFile);
