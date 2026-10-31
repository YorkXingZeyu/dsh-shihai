import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Build 90_元数据/notes.index.json from Markdown files in the vault.
 * This is deliberately conservative: missing source/evidence is allowed for a
 * draft, but the memory remains an unverified note until a human adds it.
 */
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dirs = ['20_共同经历', '30_片段', '30_约定', '35_原子', '40_项目', '50_故事', '50_日常', '60_主题'];
const outFile = path.join(root, '90_元数据', 'notes.index.json');

function unquote(v) {
  const s = String(v ?? '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}
function list(v) {
  const s = String(v ?? '').trim();
  if (!s) return [];
  if (s.startsWith('[') && s.endsWith(']')) return s.slice(1, -1).split(',').map((x) => unquote(x)).filter(Boolean);
  return [unquote(s)];
}
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return {};
  const out = {};
  let parent = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const top = raw.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (top) {
      parent = top[1];
      out[parent] = top[2] === '' ? {} : top[2];
      continue;
    }
    const child = raw.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (child && parent && typeof out[parent] === 'object') out[parent][child[1]] = child[2];
  }
  return out;
}
function inferLayer(file) {
  if (file.includes('35_原子')) return 'L2';
  if (file.includes('30_片段')) return 'L1';
  return '';
}
function clean(v) { return unquote(v ?? ''); }
function build() {
  const notes = [];
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      if (!name.endsWith('.md') || name.startsWith('.')) continue;
      const file = path.join(dir, name);
      const raw = fs.readFileSync(path.join(root, file), 'utf8');
      const fm = parseFrontmatter(raw);
      const source = typeof fm.source === 'object' ? fm.source : {};
      const id = clean(fm.id) || name.replace(/\.md$/i, '');
      const title = clean(fm.title) || (raw.match(/^#\s+(.+)$/m)?.[1] || id);
      const date = clean(fm.date) || (name.match(/\d{4}-\d{2}-\d{2}/)?.[0]) || '1970-01-01';
      const privacy = clean(fm.privacy) || 'private';
      notes.push({
        id, layer: clean(fm.layer) || inferLayer(file), type: clean(fm.type) || 'note',
        privacy, title, date,
        people: list(fm.people), project: fm.project ? clean(fm.project) : null,
        tags: list(fm.tags),
        importance: Number(fm.importance || .5), strength: Number(fm.strength || fm.importance || .5),
        confidence: Number(fm.confidence || .5), status: clean(fm.status) || 'draft',
        lifecycle: clean(fm.lifecycle) || 'active',
        nodeType: clean(fm.nodeType) || (String(fm.layer || '').toUpperCase() || 'NOTE'),
        source: {
          channel: clean(source.channel) || 'manual',
          session: source.session ? clean(source.session) : null,
          messages: list(source.messages).map(Number).filter(Number.isFinite),
          quote: clean(source.quote)
        },
        evidence: list(source.evidence).concat(list(fm.evidence)),
        related: list(fm.related),
        file: file.replace(/\\/g, '/')
      });
    }
  }
  notes.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), notes }, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ notes: notes.length, out: path.relative(root, outFile) }, null, 2));
}
build();
