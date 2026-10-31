import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, '..');
const args = process.argv.slice(2);
const configFiles = args.length ? args : ['first-batch.json', 'task-batch.json'];

const notes = [];
for (const file of configFiles) {
  const batch = JSON.parse(fs.readFileSync(path.join(base, 'config', file), 'utf8'));
  for (const n of batch.notes) notes.push({ ...n, batch: batch.batch || file });
}

const q = (s) => JSON.stringify(String(s ?? ''));
const arr = (a) => '[' + (a || []).map(q).join(', ') + ']';

function frontmatter(n) {
  const out = [];
  out.push('---');
  out.push(`id: ${q(n.id)}`);
  out.push(`category: ${q(n.category || 'task')}`);
  out.push(`type: ${q(n.type)}`);
  if (n.privacy) out.push(`privacy: ${q(n.privacy)}`);
  out.push(`title: ${q(n.title)}`);
  out.push(`date: ${q(n.date)}`);
  out.push(`people: ${arr(n.people)}`);
  out.push(`project: ${n.project ? q(n.project) : 'null'}`);
  out.push(`tags: ${arr(n.tags)}`);
  out.push(`importance: ${Number(n.importance)}`);
  out.push(`emotion: ${Number(n.emotion)}`);
  out.push(`confidence: ${Number(n.confidence)}`);
  out.push(`status: ${q(n.status)}`);
  out.push('source:');
  out.push(`  channel: ${q(n.source.channel)}`);
  out.push(`  session: ${n.source.session ? q(n.source.session) : 'null'}`);
  out.push(`  messages: [${(n.source.messages || []).join(', ')}]`);
  if (Array.isArray(n.source.relatedSessions) && n.source.relatedSessions.length) {
    out.push('  relatedSessions:');
    for (const s of n.source.relatedSessions) out.push(`    - ${q(s)}`);
  }
  out.push(`  quote: ${q(n.source.quote)}`);
  if (Array.isArray(n.source.evidence) && n.source.evidence.length) {
    out.push('  evidence:');
    for (const e of n.source.evidence) out.push(`    - ${q(e)}`);
  }
  out.push(`related: ${arr(n.related)}`);
  out.push('supersedes: null');
  out.push('---');
  return out.join('\n');
}

const created = [];
const skipped = [];
for (const n of notes) {
  const dir = path.join(base, n.dir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, n.file);
  if (fs.existsSync(file)) {
    skipped.push(path.relative(base, file));
    continue;
  }
  const body = (n.body || []).join('\n\n');
  const text = `${frontmatter(n)}\n\n# ${n.title}\n\n${body}\n\n---\n\n*记忆草稿 · 来源可追溯；如记错，请用更正而不是覆盖。*\n`;
  fs.writeFileSync(file, text, 'utf8');
  created.push({ id: n.id, file: path.relative(base, file).replace(/\\/g, '/') });
}

const indexFile = path.join(base, '90_元数据', 'notes.index.json');
const previous = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { notes: [] };
const preserved = (previous.notes || []).filter((n) => n.layer === 'L1' || n.layer === 'L2');
const configNote = (n) => ({
  id: n.id,
  layer: null,
  batch: n.batch,
  category: n.category || 'task',
  type: n.type,
  privacy: n.privacy || null,
  title: n.title,
  date: n.date,
  people: n.people,
  project: n.project,
  tags: n.tags,
  importance: n.importance,
  emotion: n.emotion,
  confidence: n.confidence,
  status: n.status,
  source: n.source,
  file: n.dir + '/' + n.file
});
const configured = notes.map(configNote);
const configuredIds = new Set(configured.map((n) => n.id));
const indexNotes = [...configured, ...preserved.filter((n) => !configuredIds.has(n.id))]
  .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
const index = {
  generatedAt: new Date().toISOString(),
  notes: indexNotes
};
fs.writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8');

const groups = {
  personalization: '个性化 / 起点',
  task: '共同任务'
};
let md = '# 全部记忆索引\n\n';
md += `生成时间：${index.generatedAt}\n\n`;
for (const key of ['personalization', 'task']) {
  const list = index.notes.filter((n) => n.category === key && !n.layer);
  if (!list.length) continue;
  md += `## ${groups[key]}（${list.length} 条）\n\n`;
  md += '| ID | 标题 | 类型 | 日期 | 文件 | 来源 |\n';
  md += '| --- | --- | --- | --- | --- | --- |\n';
  for (const n of list) {
    const sourceLabel = n.source.channel === 'local'
      ? 'local / ' + (n.source.evidence || []).join('；')
      : `${n.source.channel} / ${n.source.session} / seq ${n.source.messages.join(', ')}`;
    md += `| \`${n.id}\` | ${n.title} | ${n.type} | ${n.date} | [${n.file}](${n.file}) | ${sourceLabel} |\n`;
  }
  md += '\n';
}
const learned = index.notes.filter((n) => n.layer);
if (learned.length) {
  md += `## 理解层（L1/L2，${learned.length} 条）\n\n`;
  md += '| ID | 层 | 标题 | 类型 | 日期 | 文件 |\n| --- | --- | --- | --- | --- | --- |\n';
  for (const n of learned) md += `| \`${n.id}\` | ${n.layer} | ${n.title} | ${n.type} | ${n.date} | [${n.file}](<${n.file}>) |\n`;
}
fs.writeFileSync(path.join(base, '90_元数据', '全部记忆索引.md'), md, 'utf8');

console.log(JSON.stringify({
  created: created.length,
  skipped: skipped.length,
  byCategory: {
    personalization: index.notes.filter((n) => n.category === 'personalization').length,
    task: index.notes.filter((n) => n.category === 'task').length
  },
  createdFiles: created,
  indexPath: path.join(base, '90_元数据', 'notes.index.json')
}, null, 2));
