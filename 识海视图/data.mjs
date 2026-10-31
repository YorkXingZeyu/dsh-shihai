import fs from 'node:fs';
import path from 'node:path';

export function stripFrontmatter(text) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  let body = (m ? text.slice(m[0].length) : text).trim();
  body = body.replace(/^#\s+.*\r?\n+/, '');
  body = body.replace(/\r?\n---\r?\n+\*记忆草稿[^\n]*\*?\s*$/, '').trim();
  return body;
}

export function buildData(vaultRoot) {
  const indexPath = path.join(vaultRoot, '90_元数据', 'notes.index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  let maxMtime = fs.statSync(indexPath).mtimeMs;
  const interactionsPath = path.join(vaultRoot, '.private', 'interactions.index.json');
  let interactions = [];
  let interactionVersion = 0;
  const layoutPath = path.join(vaultRoot, '90_元数据', 'layout.json');
  let layout = null;
  let layoutVersion = 0;
  if (fs.existsSync(layoutPath)) {
    try {
      const st = fs.statSync(layoutPath);
      layoutVersion = st.mtimeMs;
      if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
      layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
    } catch { layout = null; }
  }
  if (fs.existsSync(interactionsPath)) {
    try {
      const st = fs.statSync(interactionsPath);
      interactionVersion = st.mtimeMs;
      if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
      interactions = JSON.parse(fs.readFileSync(interactionsPath, 'utf8')).interactions || [];
    } catch { interactions = []; }
  }
  const notes = index.notes.map((n) => {
    const file = path.join(vaultRoot, n.file);
    const stat = fs.statSync(file);
    if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
    const raw = fs.readFileSync(file, 'utf8');
    return {
      id: n.id,
      layer: n.layer || '',
      type: n.type,
      privacy: n.privacy,
      title: n.title,
      date: n.date,
      people: n.people,
      project: n.project,
      tags: n.tags,
      importance: n.importance,
      strength: n.strength ?? n.importance ?? 0,
      nodeType: n.nodeType || 'NOTE',
      emotion: n.emotion,
      confidence: n.confidence,
      status: n.status,
      lifecycle: n.lifecycle || 'active',
      meaning: n.meaning || '',
      meaningDerived: !!n.meaningDerived,
      story: n.story || '',
      storyDerived: !!n.storyDerived,
      source: n.source,
      related: n.related || [],
      file: n.file,
      body: stripFrontmatter(raw)
    };
  });
  notes.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.title.localeCompare(b.title));
  const profileFile = fs.existsSync(path.join(vaultRoot, '90_元数据', 'profile.json'))
    ? path.join(vaultRoot, '90_元数据', 'profile.json')
    : path.join(vaultRoot, '90_元数据', 'profile.json');
  let profile = null;
  if (fs.existsSync(profileFile)) {
    const stat = fs.statSync(profileFile);
    if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
    try { profile = JSON.parse(fs.readFileSync(profileFile, 'utf8')); } catch { profile = null; }
  }
  const healthFile = path.join(vaultRoot, '90_元数据', '记忆健康.json');
  let health = null;
  if (fs.existsSync(healthFile)) {
    const stat = fs.statSync(healthFile);
    if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
    try { health = JSON.parse(fs.readFileSync(healthFile, 'utf8')); } catch { health = null; }
  }
  const storiesFile = path.join(vaultRoot, '90_元数据', '故事集.json');
  let stories = [];
  if (fs.existsSync(storiesFile)) {
    const stat = fs.statSync(storiesFile);
    if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
    try { stories = JSON.parse(fs.readFileSync(storiesFile, 'utf8')).stories || []; } catch { stories = []; }
  }
  return {
    version: `${Math.round(maxMtime)}:${notes.length}:${profile?.version || 'L3-0'}:${interactions.length}`,
    interactionVersion,
    layoutVersion,
    layout,
    interactions,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    source: 'Shihai vault / 90_元数据/notes.index.json',
    profile,
    health,
    stories,
    notes
  };
}
