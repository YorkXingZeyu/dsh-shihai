import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, '..');
const notes = JSON.parse(fs.readFileSync(path.join(base, '90_元数据', 'notes.index.json'), 'utf8')).notes || [];
const interactionPath = path.join(base, '.private', 'interactions.index.json');
const interactions = fs.existsSync(interactionPath)
  ? (JSON.parse(fs.readFileSync(interactionPath, 'utf8')).interactions || [])
  : [];
const stories = JSON.parse(fs.readFileSync(path.join(base, '90_元数据', '故事集.json'), 'utf8')).stories || [];
const embeddingPath = path.join(base, '90_元数据', 'embeddings.json');
const embeddingFile = fs.existsSync(embeddingPath) ? JSON.parse(fs.readFileSync(embeddingPath, 'utf8')) : null;
const layoutPath = path.join(base, '90_元数据', 'layout.json');
const previous = fs.existsSync(layoutPath) ? JSON.parse(fs.readFileSync(layoutPath, 'utf8')) : null;

const hash = (s) => {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const seeded = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const tokens = (text) => {
  const s = String(text || '').toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]+/g, ' ');
  const out = [];
  for (const w of s.split(/\s+/)) {
    if (!w) continue;
    out.push('w:' + w);
    if (/^[\u4e00-\u9fa5]+$/.test(w)) {
      for (let i = 0; i < w.length - 1; i++) out.push('b:' + w.slice(i, i + 2));
      for (let i = 0; i < w.length - 2; i++) out.push('c:' + w.slice(i, i + 3));
    }
  }
  return out;
};

const docs = [];
for (const n of notes) {
  docs.push({
    id: n.id, kind: 'note', project: n.project || '', tags: n.tags || [],
    text: [n.title, n.body, n.project, ...(n.tags || []), ...(n.people || [])].filter(Boolean).join(' '),
    related: n.related || []
  });
}
for (const it of interactions) {
  docs.push({
    id: it.id, kind: 'interaction', project: it.project || '', tags: [],
    text: [it.project, it.user, it.assistant, it.title].filter(Boolean).join(' '),
    related: it.formalRefs || []
  });
}
const N = docs.length;
const newCount = docs.filter((d) => !previous?.nodes?.[d.id]).length;
const requestedFull = process.argv.includes('--full');
const requestedLocal = process.argv.includes('--local');
const mode = requestedFull ? 'full' : requestedLocal ? 'local' : !previous ? 'full' : newCount >= 24 ? 'full' : newCount >= 5 ? 'local' : 'incremental';

const counts = [];
const df = new Map();
for (const d of docs) {
  const m = new Map();
  for (const t of tokens(d.text)) m.set(t, (m.get(t) || 0) + 1);
  counts.push(m);
  for (const t of m.keys()) df.set(t, (df.get(t) || 0) + 1);
}
const tfidf = counts.map((m) => {
  const v = new Map();
  for (const [t, c] of m) {
    const idf = Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1;
    v.set(t, (1 + Math.log(c)) * idf);
  }
  let norm = 0;
  for (const x of v.values()) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (const [t, x] of v) v.set(t, x / norm);
  return v;
});
const useEmbedding = !!(embeddingFile?.vectors && docs.every((d) => Array.isArray(embeddingFile.vectors[d.id]) && embeddingFile.vectors[d.id].length === embeddingFile.dim));
const emb = useEmbedding ? docs.map((d) => embeddingFile.vectors[d.id]) : null;
const cosine = (i, j) => {
  if (useEmbedding) {
    const a = emb[i], b = emb[j];
    let s = 0;
    for (let k = 0; k < a.length; k++) s += a[k] * b[k];
    return s;
  }
  const a = tfidf[i], b = tfidf[j];
  const small = a.size < b.size ? a : b;
  const large = small === a ? b : a;
  let s = 0;
  for (const [t, x] of small) { const y = large.get(t); if (y) s += x * y; }
  return s;
};
const relatedPair = new Set();
for (const d of docs) for (const r of d.related || []) relatedPair.add([d.id, r].sort().join('|'));
const projectOf = (d) => (d.project || '').trim().split(/\s*\/\s*/)[0];
const sims = docs.map(() => []);
for (let i = 0; i < N; i++) {
  for (let j = i + 1; j < N; j++) {
    let s = cosine(i, j);
    if (projectOf(docs[i]) && projectOf(docs[i]) === projectOf(docs[j])) s += .09;
    if (relatedPair.has([docs[i].id, docs[j].id].sort().join('|'))) s += .22;
    if (s > .005) { sims[i].push([j, s]); sims[j].push([i, s]); }
  }
}
const knn = sims.map((arr) => arr.sort((a, b) => b[1] - a[1]).slice(0, 8));
const formalIdx = docs.map((d, i) => d.kind === 'note' ? i : -1).filter((i) => i >= 0);
const anchors = {};
const semanticEdgeSet = new Set();
const semanticEdges = [];
for (let i = 0; i < N; i++) {
  const list = (knn[i] || []).filter(([j, w]) => w > 0.45).slice(0, 2);
  for (const [j, w] of list) {
    const a = docs[i].id, b = docs[j].id;
    const key = [a, b].sort().join('|');
    if (!semanticEdgeSet.has(key)) { semanticEdgeSet.add(key); semanticEdges.push({ a, b, weight: Number(w.toFixed(4)) }); }
  }
  if (docs[i].kind === 'interaction') {
    let best = null, bestS = -1;
    for (const j of formalIdx) { const w = cosine(i, j); if (w > bestS) { bestS = w; best = docs[j].id; } }
    if (best) anchors[docs[i].id] = { note: best, score: Number(bestS.toFixed(4)) };
  }
}


const rand = seeded(0x5EED2026);
const pos = docs.map((d) => {
  const old = previous?.nodes?.[d.id];
  if (old) return [old.x, old.y, old.z];
  const u = rand() * 2 - 1, a = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return [Math.cos(a) * r * 170, u * 150, Math.sin(a) * r * 170];
});
const assigned = docs.map((d) => !!previous?.nodes?.[d.id]);
for (let i = 0; i < N; i++) {
  if (assigned[i]) continue;
  const near = (knn[i] || []).find(([j]) => assigned[j]);
  if (near) {
    const j = near[0], rng = seeded(hash(docs[i].id + ':insert'));
    pos[i] = [pos[j][0] + (rng() - .5) * 20, pos[j][1] + (rng() - .5) * 20, pos[j][2] + (rng() - .5) * 20];
  }
  assigned[i] = true;
}
if (mode === 'full') {
  const anchor = docs.map((d) => previous?.nodes?.[d.id] || null);
  for (let step = 0; step < 90; step++) {
    for (let i = 0; i < N; i++) {
      const a = pos[i];
      for (let j = i + 1; j < N; j++) {
        const b = pos[j];
        let dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < .01) { dx = .1; dy = .1; dz = .1; d2 = .03; }
        const f = Math.min(2.2, 2200 / d2);
        const d = Math.sqrt(d2);
        a[0] += dx / d * f; a[1] += dy / d * f; a[2] += dz / d * f;
        b[0] -= dx / d * f; b[1] -= dy / d * f; b[2] -= dz / d * f;
      }
    }
    for (let i = 0; i < N; i++) {
      for (const [j, w] of knn[i]) {
        const b = pos[j];
        let dx = b[0] - pos[i][0], dy = b[1] - pos[i][1], dz = b[2] - pos[i][2];
        const d = Math.hypot(dx, dy, dz) || .001;
        const f = (d - 70) * (.005 + w * .015);
        pos[i][0] += dx / d * f; pos[i][1] += dy / d * f; pos[i][2] += dz / d * f;
      }
      if (anchor[i]) {
        pos[i][0] = pos[i][0] * .92 + anchor[i].x * .08;
        pos[i][1] = pos[i][1] * .92 + anchor[i].y * .08;
        pos[i][2] = pos[i][2] * .92 + anchor[i].z * .08;
      }
      const d = Math.hypot(...pos[i]) || .001;
      if (d > 320) { pos[i][0] *= 320 / d; pos[i][1] *= 320 / d; pos[i][2] *= 320 / d; }
    }
  }
}
for (const p of pos) for (let k = 0; k < 3; k++) p[k] = Math.max(-320, Math.min(320, Number(p[k].toFixed(3))));

const K = Math.min(10, N);
const cvec = useEmbedding ? emb : pos;
const cdist = (a, b) => {
  if (useEmbedding) { let s = 0; for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) * (a[k] - b[k]); return s; }
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
};
const centersK = [cvec[0].slice()];
while (centersK.length < K) {
  let best = 0, bestD = -1;
  for (let i = 0; i < N; i++) {
    let d = Infinity;
    for (const c of centersK) d = Math.min(d, cdist(cvec[i], c));
    if (d > bestD) { bestD = d; best = i; }
  }
  centersK.push(cvec[best].slice());
}
let community = new Array(N).fill(0);
for (let iter = 0; iter < 25; iter++) {
  for (let i = 0; i < N; i++) {
    let best = 0, bestD = Infinity;
    for (let k = 0; k < K; k++) { const d = cdist(cvec[i], centersK[k]); if (d < bestD) { bestD = d; best = k; } }
    community[i] = best;
  }
  const sums = Array.from({ length: K }, () => null);
  for (let i = 0; i < N; i++) {
    const k = community[i]; const v = cvec[i];
    if (!sums[k]) sums[k] = new Array(v.length).fill(0).concat([0]);
    for (let z = 0; z < v.length; z++) sums[k][z] += v[z];
    sums[k][v.length]++;
  }
  for (let k = 0; k < K; k++) if (sums[k]) centersK[k] = sums[k].slice(0, cvec[0].length).map((x) => x / sums[k][cvec[0].length]);
}
const palette = [190, 166, 10, 214, 142, 310, 286, 70, 262, 238, 118, 94, 334];
const communities = {};
const usedLabel = new Map();
for (let k = 0; k < K; k++) {
  const members = docs.filter((_, i) => community[i] === k);
  if (!members.length) continue;
  const tags = new Map();
  for (const d of members) for (const t of d.tags || []) tags.set(t, (tags.get(t) || 0) + 1);
  const topTags = [...tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([t]) => t);
  const proj = new Map();
  for (const d of members) proj.set(d.project || '未归类', (proj.get(d.project || '未归类') || 0) + 1);
  const topProject = [...proj.entries()].sort((a, b) => b[1] - a[1])[0][0];
  let label = topTags.join(' / ') || topProject;
  const n = (usedLabel.get(label) || 0) + 1; usedLabel.set(label, n);
  if (n > 1) label += ' · ' + n;
  const hue = palette[k % palette.length];
  communities[k] = { label, hue, color: `hsl(${hue} 62% 64%)`, count: members.length, project: topProject };
}
const layoutNodes = {};
docs.forEach((d, i) => {
  layoutNodes[d.id] = { x: pos[i][0], y: pos[i][1], z: pos[i][2], community: community[i] };
  if (anchors[d.id]) layoutNodes[d.id].anchor = anchors[d.id];
});

const storyPositions = {};
for (const s of stories) {
  const rel = (s.related || []).map((id) => layoutNodes[id]).filter(Boolean);
  const old = previous?.stories?.[s.id];
  if (mode !== 'full' && old) storyPositions[s.id] = old;
  else if (rel.length) storyPositions[s.id] = rel.reduce((a, p) => ({ x: a.x + p.x / rel.length, y: a.y + p.y / rel.length, z: a.z + p.z / rel.length }), { x: 0, y: 0, z: 0 });
  else storyPositions[s.id] = { x: 0, y: 80, z: 0 };
}

let knnSame = 0, knnTotal = 0;
for (let i = 0; i < N; i++) {
  if (docs[i].kind !== 'note') continue;
  const p = projectOf(docs[i]);
  if (!p) continue;
  for (const [j] of knn[i]) { knnTotal++; if (projectOf(docs[j]) === p) knnSame++; }
}
const relatedPairs = [];
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (relatedPair.has([docs[i].id, docs[j].id].sort().join('|'))) relatedPairs.push([pos[i], pos[j]]);
const meanDist = (pairs) => pairs.length ? pairs.reduce((s, [a, b]) => s + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), 0) / pairs.length : 0;
const relatedMean = meanDist(relatedPairs);
let randomSum = 0, randomN = 0;
for (let k = 0; k < 20000; k++) {
  const i = hash('ra' + k) % N, j = hash('rb' + k) % N;
  if (i === j) continue;
  randomSum += Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1], pos[i][2] - pos[j][2]);
  randomN++;
}
const randomMean = randomN ? randomSum / randomN : 0;
const out = {
  generatedAt: new Date().toISOString(),
  method: `${useEmbedding ? 'bge-small-zh-v1.5-embedding' : 'tfidf-char-ngram'} + ${mode} + communities`,
  vectorSource: useEmbedding ? 'bge-small-zh-v1.5' : 'tfidf-char-ngram',
  embeddingModel: useEmbedding ? embeddingFile.model : null,
  layoutMode: mode,
  newNodes: newCount,
  seed: '0x5EED2026',
  version: `${Date.now()}:${N}`,
  nodes: layoutNodes,
  stories: storyPositions,
  communities,
  semanticEdges,
  anchors,
  metrics: {
    nodes: N, notes: notes.length, interactions: interactions.length, newNodes: newCount,
    knnPurity: knnTotal ? Number((knnSame / knnTotal).toFixed(4)) : 0,
    relatedPairs: relatedPairs.length,
    relatedMeanDistance: Number(relatedMean.toFixed(2)),
    randomMeanDistance: Number(randomMean.toFixed(2)),
    relatedRandomRatio: randomMean ? Number((relatedMean / randomMean).toFixed(3)) : 0
  }
};
fs.writeFileSync(layoutPath, JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({ path: layoutPath, mode, ...out.metrics }, null, 2));
