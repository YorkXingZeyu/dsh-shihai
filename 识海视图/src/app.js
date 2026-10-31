(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const LIVE = location.protocol === 'http:' || location.protocol === 'https:';

  let DATA = window.MEMORY_DATA || { notes: [], version: '', generatedAt: null };
  let NOTES = [];
  let showPrivate = true;
  let labelsCompact = true;
  let selected = null;
  let hover = null;
  let query = '';
  let results = [];
  let viewMode = 'sea';
  let paused = reduced.matches;
  let liveState = LIVE ? 'connecting' : 'snapshot';
  let liveTransients = [];
  let lastLiveAt = 0;
  let liveStream = null;
  let birthStars = [];
  let initialized = false;
  let time = 0;
  let last = performance.now();
  let yaw = .15;
  let pitch = .13;
  let zoom = 1;
  let zoomTarget = 1;
  let orbit = true;
  let drag = null;
  let width = innerWidth;
  let height = innerHeight;
  let graph = null;
  let byId = new Map();
  let projected = [];
  let SEA_CLUSTERS = [];
  let INTERACTIONS = [];
  let LAYOUT = null;
  let focusDepth = 1;
  let CONTEXT = { nodes: new Map(), edges: new Set() };
  let adjacency = new Map();
  let EDGE_CURVES = new Map();
  let TRANSMISSION = { seed: null, start: 0, signals: [] };
  const SIGNAL_SPEED = 90;
  const SIGNAL_DWELL = .045;
  const COMMUNITY_COLORS = new Map();
  let LIVE_STARS = [];
  let interactionMode = 1; // 1 recent 7d, 2 all
  let labelBoxes = [];

  const canvas = $('#universe');
  const ctx = canvas.getContext('2d');
  const sprites = new Map();

  function hash(s) {
    let h = 2166136261;
    for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rand(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hex(n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); }
  function timeColor(t) {
    const a = [130, 201, 237];
    const b = [233, 207, 157];
    return '#' + [0, 1, 2].map((i) => hex(a[i] + (b[i] - a[i]) * t)).join('');
  }

  function hslToHex(h, sat, light) {
    h = ((Number(h) % 360) + 360) % 360 / 360;
    sat = Math.max(0, Math.min(100, sat)) / 100;
    light = Math.max(0, Math.min(100, light)) / 100;
    const q = light < .5 ? light * (1 + sat) : light + sat - light * sat;
    const p = 2 * light - q;
    const c = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return '#' + [c(h + 1 / 3), c(h), c(h - 1 / 3)].map((v) => hex(v * 255)).join('');
  }

  function agedColor(n) {
    if (n.kind === 'story') return '#e7c47a';
    const t = n.ageT ?? .5;
    const m = String(n.color || '').match(/hsl\(\s*([\d.]+)/);
    const h = m ? m[1] : 42;
    return hslToHex(h, 38 + 30 * t, 38 + 30 * t);
  }

  function cleanProjectName(s) {
    return String(s || '')
      .replace(/\s*\(cwd:.*$/i, '')
      .replace(/\s*[（(][^）)]*[）)]\s*$/g, '')
      .trim();
  }

  function projectAlias(s) {
    return cleanProjectName(s) || '未归类';
  }

  const CLUSTER_HUES = {};
  const STORY_HUE = 42;
  const clusterColorCache = new Map();
  const usedClusterHues = new Set(Object.values(CLUSTER_HUES));
  function clusterColor(name) {
    if (COMMUNITY_COLORS.has(name)) return COMMUNITY_COLORS.get(name);
    if (name === '其他项目') return 'hsl(210 16% 62%)';
    if (clusterColorCache.has(name)) return clusterColorCache.get(name);
    const fixed = CLUSTER_HUES[name];
    if (fixed != null) {
      const color = `hsl(${fixed} 62% 64%)`;
      clusterColorCache.set(name, color);
      return color;
    }
    let h = hash(name) % 360;
    const near = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    for (let i = 0; i < 360; i++) {
      const hitsGold = h >= 30 && h <= 54;
      const duplicate = [...usedClusterHues].some((u) => near(u, h) < 24);
      if (!hitsGold && !duplicate) break;
      h = (h + 19) % 360;
    }
    usedClusterHues.add(h);
    const color = `hsl(${h} 62% 64%)`;
    clusterColorCache.set(name, color);
    return color;
  }

  function rebuildPositions() {
    const n = NOTES.length;
    if (viewMode === 'sea') {
      rebuildSea();
      return;
    }
    NOTES.forEach((note, i) => {
      const rng = rand(hash(note.id));
      const t = n > 1 ? i / (n - 1) : 0;
      note.t = t;
      note.color = timeColor(t);
      const angle = -Math.PI * .82 + t * Math.PI * 1.58 + (rng() - .5) * .34;
      // 距离编码：中心=最新，外圈=更早。
      const rad = 128 + (1 - t) * 182 + (rng() - .5) * 36;
      note.x = Math.cos(angle) * rad;
      note.z = Math.sin(angle) * rad * .92;
      note.y = (rng() - .5) * 220 + Math.sin(t * Math.PI * 2) * 28;
    });
    for (const s of DATA.stories || []) {
      const first = NOTES.find((x) => x.id === (s.related || [])[0]);
      const rng = rand(hash(s.id + ':timeline'));
      const base = first || { x: 0, y: 0, z: 0 };
      s.x = base.x + (rng() - .5) * 44 + 22;
      s.y = base.y + (rng() - .5) * 44 - 22;
      s.z = base.z + (rng() - .5) * 44;
    }
  }

  function spherePoint(seed, radius) {
    const rng = rand(hash(seed));
    const u = rng() * 2 - 1;
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    return { x: Math.cos(a) * r * radius, y: u * radius, z: Math.sin(a) * r * radius };
  }

  function visibleInteractions() {
    if (!INTERACTIONS.length) return [];
    if (interactionMode === 2) return INTERACTIONS;
    const dates = INTERACTIONS.map((x) => x.date).filter(Boolean).sort();
    const max = dates[dates.length - 1];
    if (!max) return INTERACTIONS;
    const cutoff = new Date(max + 'T00:00:00');
    cutoff.setDate(cutoff.getDate() - 6);
    return INTERACTIONS.filter((x) => x.date && new Date(x.date + 'T00:00:00') >= cutoff);
  }

  function rebuildSea() {
    const n = NOTES.length;
    const allDates = [...NOTES.map((x) => x.date), ...INTERACTIONS.map((x) => x.date)].sort();
    const dayMin = allDates[0] || '2026-01-01';
    const dayMax = allDates.slice(-1)[0] || '2026-12-31';
    const ageOf = (date) => {
      const a = new Date(dayMin + 'T00:00:00').getTime();
      const b = new Date(dayMax + 'T00:00:00').getTime();
      if (!date || a === b) return .5;
      return Math.max(0, Math.min(1, (new Date(date + 'T00:00:00').getTime() - a) / (b - a)));
    };
    const stats = new Map();
    for (const n of NOTES) {
      const k = projectAlias(n.project || '') || '未归类';
      const v = stats.get(k) || { count: 0 };
      v.count++;
      stats.set(k, v);
    }
    for (const it of INTERACTIONS) {
      const k = it.cluster || '闲聊/未归类';
      const v = stats.get(k) || { count: 0 };
      v.count++;
      stats.set(k, v);
    }
    const sortedActual = [...stats.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
    const keep = new Set(sortedActual.slice(0, 12).map(([k]) => k));
    const displayOf = (k) => keep.has(k) ? k : '其他项目';
    const displayStats = new Map();
    for (const [k, v] of stats) {
      const d = displayOf(k);
      displayStats.set(d, (displayStats.get(d) || 0) + v.count);
    }
    const projects = [...displayStats.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
    const centers = new Map();
    const forceNodes = projects.map((key, i) => {
      const a = -Math.PI / 2 + i * Math.PI * (3 - Math.sqrt(5));
      const rr = 180 + (i % 3) * 70;
      return { key, x: Math.cos(a) * rr, y: Math.sin(a) * rr * .72, r: 44 + Math.min(46, Math.sqrt(displayStats.get(key) || 1) * 4.2), i };
    });
    for (let step = 0; step < 100; step++) {
      for (let i = 0; i < forceNodes.length; i++) {
        const a = forceNodes[i];
        for (let j = i + 1; j < forceNodes.length; j++) {
          const b = forceNodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d = Math.hypot(dx, dy) || .001;
          const need = a.r + b.r + 18;
          if (d < need) {
            const push = (need - d) / d * .5;
            a.x -= dx * push; a.y -= dy * push;
            b.x += dx * push; b.y += dy * push;
          }
        }
        const rad = Math.hypot(a.x, a.y) || .001;
        if (rad < 190) { a.x *= 190 / rad; a.y *= 190 / rad; }
        if (rad > 390) { a.x *= 390 / rad; a.y *= 390 / rad; }
      }
    }
    for (const n of forceNodes) {
      const depth = Math.sin(n.i * 2.1) * 260 + (n.i % 3 - 1) * 60;
      centers.set(n.key, { x: n.x, y: n.y, z: depth });
    }
    const pre = LAYOUT?.nodes || null;
    NOTES.forEach((note) => {
      const rng = rand(hash(note.id + ':sea'));
      const actual = projectAlias(note.project || '') || '未归类';
      const comm = LAYOUT?.communities?.[pre?.[note.id]?.community];
      const key = comm?.label || displayOf(actual);
      const c = centers.get(key) || centers.get(displayOf(actual)) || { x: 0, y: 0, z: 0 };
      note.clusterKey = key;
      note.cluster = key;
      const spread = 28 + Math.min(18, Math.sqrt(displayStats.get(key) || 1) * 1.6);
      note.ageT = ageOf(note.date);
      note.t = note.ageT;
      note.clusterKey = key;
      note.color = comm?.color || clusterColor(key);
      if (pre && pre[note.id]) {
        note.x = pre[note.id].x; note.y = pre[note.id].y; note.z = pre[note.id].z;
      } else {
        note.x = c.x + (rng() - .5) * spread;
        note.y = c.y + (rng() - .5) * spread;
        note.z = c.z + (rng() - .5) * spread;
      }
    });
    INTERACTIONS.forEach((it) => {
      const rng = rand(hash(it.id + ':sea'));
      const actual = it.cluster || '闲聊/未归类';
      const comm = LAYOUT?.communities?.[pre?.[it.id]?.community];
      const key = comm?.label || displayOf(actual);
      const c = centers.get(key) || centers.get('其他项目') || centers.get('未归类');
      it.actualCluster = actual;
      it.cluster = key;
      const spread = 16 + Math.min(22, Math.sqrt(displayStats.get(key) || 1) * 1.5);
      it._interaction = true;
      it.ageT = ageOf(it.date);
      it.color = comm?.color || clusterColor(key);
      it.clusterKey = key;
      if (pre && pre[it.id]) {
        it.x = pre[it.id].x; it.y = pre[it.id].y; it.z = pre[it.id].z;
      } else {
        it.x = c.x + (rng() - .5) * spread;
        it.y = c.y + (rng() - .5) * spread;
        it.z = c.z + (rng() - .5) * spread;
      }
    });
    // 只拉 related，不按类型强行分簇；让同一段经历自然靠近。
    if (!pre) {
    for (let k = 0; k < 7; k++) {
      for (const note of NOTES) {
        const rel = (note.related || []).map((id) => NOTES.find((x) => x.id === id)).filter(Boolean);
        if (!rel.length) continue;
        const avg = rel.reduce((a, x) => ({ x: a.x + x.x, y: a.y + x.y, z: a.z + x.z }), { x: 0, y: 0, z: 0 });
        note.x = note.x * .82 + (avg.x / rel.length) * .18;
        note.y = note.y * .82 + (avg.y / rel.length) * .18;
        note.z = note.z * .82 + (avg.z / rel.length) * .18;
      }
    }
    }
    // 星团名字：只在记忆海显示，时间轴仍然不分类。
    const groups = new Map();
    for (const note of NOTES) {
      const name = note.clusterKey || displayOf(projectAlias(note.project || '') || '未归类');
      const arr = groups.get(name) || [];
      arr.push(note);
      groups.set(name, arr);
    }
    for (const it of INTERACTIONS) {
      const name = it.cluster || '闲聊/未归类';
      const arr = groups.get(name) || [];
      arr.push(it);
      groups.set(name, arr);
    }
    SEA_CLUSTERS = [...groups.entries()]
      .map(([name, arr]) => ({
        name,
        color: clusterColor(name),
        count: arr.length,
        formalCount: arr.filter((x) => !x._interaction).length,
        interactionCount: arr.filter((x) => x._interaction).length,
        x: arr.reduce((sum, n) => sum + n.x, 0) / arr.length,
        y: arr.reduce((sum, n) => sum + n.y, 0) / arr.length,
        z: arr.reduce((sum, n) => sum + n.z, 0) / arr.length
      }))
      .sort((a, b) => b.count - a.count)
      .map((c, i) => ({ ...c, major: i < 8 }));

    const dates = NOTES.map((x) => x.date).sort();
    const minDate = dates[0] || '2026-01-01';
    const maxDate = dates[dates.length - 1] || '2026-12-31';
    const storyT = (d) => {
      if (!d || minDate === maxDate) return .5;
      const a = new Date(minDate + 'T00:00:00').getTime();
      const b = new Date(maxDate + 'T00:00:00').getTime();
      return Math.max(0, Math.min(1, (new Date(d + 'T00:00:00').getTime() - a) / (b - a)));
    };
    const storyPlaced = [];
    for (const s of DATA.stories || []) {
      const rel = (s.related || []).map((id) => NOTES.find((x) => x.id === id)).filter(Boolean);
      const lp = LAYOUT?.stories?.[s.id];
      const base = lp || (rel.length
        ? rel.reduce((acc, n) => ({ x: acc.x + n.x / rel.length, y: acc.y + n.y / rel.length, z: acc.z + n.z / rel.length }), { x: 0, y: 0, z: 0 })
        : spherePoint('story:' + s.id, 180));
      const angle = (hash(s.id + ':angle') % 360) / 180 * Math.PI;
      const off = 24 + hash(s.id + ':off') % 14;
      s.x = base.x + Math.cos(angle) * off;
      s.y = base.y + Math.sin(angle) * off * .7;
      s.z = base.z + Math.sin(angle) * off;
      for (const prev of storyPlaced) {
        const dx = s.x - prev.x, dy = s.y - prev.y;
        const d = Math.hypot(dx, dy);
        if (d < 34) {
          const ux = d < .01 ? Math.cos(angle) : dx / d;
          const uy = d < .01 ? Math.sin(angle) : dy / d;
          const push = (34 - d) / Math.max(1, d);
          s.x += ux * push;
          s.y += uy * push;
        }
      }
      storyPlaced.push({ x: s.x, y: s.y });
    }
    if ((DATA.stories || []).length >= 2) {
      const arr = DATA.stories;
      SEA_CLUSTERS.push({
        name: '共同经历', color: '#e7c47a', count: arr.length,
        x: arr.reduce((sum, s) => sum + s.x, 0) / arr.length,
        y: arr.reduce((sum, s) => sum + s.y, 0) / arr.length,
        z: arr.reduce((sum, s) => sum + s.z, 0) / arr.length
      });
    }
    SEA_CLUSTERS.sort((a, b) => b.count - a.count);
  }

  const HIDDEN_STATES = new Set(['superseded', 'expired', 'pending']);

  function liveNotes() {
    return NOTES.filter((n) => !HIDDEN_STATES.has(n.lifecycle || 'active'));
  }

  function visibleNotes() {
    return liveNotes().filter((n) => showPrivate || n.privacy !== 'private');
  }

  function buildGraph() {
    const nodes = [{ id: 'core', kind: 'core', title: '识海', x: 0, y: 0, z: 0, color: '#fff2da' }];
    const edges = [];
    const shown = liveNotes();
    for (const n of shown) {
      nodes.push({
        id: n.id, kind: 'memory', title: n.title, color: n.color,
        layer: n.layer, project: n.project, cluster: n.clusterKey || projectAlias(n.project), clusterColor: clusterColor(n.clusterKey || projectAlias(n.project)), privacy: n.privacy, importance: n.importance,
        strength: n.strength ?? n.importance ?? 0, nodeType: n.nodeType || 'NOTE', ageT: n.ageT ?? .5,
        date: n.date, x: n.x, y: n.y, z: n.z
      });
      edges.push({ a: 'core', b: n.id, kind: 'self' });
    }
    if (viewMode === 'sea') {
      for (const s of DATA.stories || []) {
        nodes.push({
          id: s.id, kind: 'story', title: s.title, color: '#e7c47a',
          project: '共同经历', cluster: '共同经历', importance: .92, nodeType: 'STORY', date: s.date,
          x: s.x || 0, y: s.y || 0, z: s.z || 0
        });
        edges.push({ a: 'core', b: s.id, kind: 'self' });
        for (const rel of s.related || []) if (NOTES.some((x) => x.id === rel)) edges.push({ a: s.id, b: rel, kind: 'story' });
      }
      for (let i = 0; i < shown.length - 1; i++) {
        if ((shown[i].project || '') && shown[i].project === shown[i + 1].project) edges.push({ a: shown[i].id, b: shown[i + 1].id, kind: 'cluster' });
      }
    } else {
      for (const s of DATA.stories || []) {
        nodes.push({
          id: s.id, kind: 'story', title: s.title, color: '#e7c47a',
          project: '共同经历', cluster: '共同经历', importance: .92, nodeType: 'STORY', date: s.date,
          x: s.x || 0, y: s.y || 0, z: s.z || 0
        });
        edges.push({ a: 'core', b: s.id, kind: 'self' });
        for (const rel of s.related || []) if (NOTES.some((x) => x.id === rel)) edges.push({ a: s.id, b: rel, kind: 'story' });
      }
      for (let i = 0; i < shown.length - 1; i++) {
        edges.push({ a: shown[i].id, b: shown[i + 1].id, kind: 'time' });
      }
    }
    for (const n of shown) {
      for (const rel of n.related || []) {
        if (NOTES.some((x) => x.id === rel)) edges.push({ a: n.id, b: rel, kind: 'related' });
      }
    }
    for (const it of LIVE_STARS) {
      nodes.push({
        id: it.id, kind: 'interaction', title: it.title || '新交互', project: it.project, cluster: it.cluster,
        clusterColor: clusterColor(it.cluster), color: it.color, ageT: 1, importance: .55, candidate: false,
        provisional: true, date: it.date, x: it.x, y: it.y, z: it.z
      });
      edges.push({ a: 'core', b: it.id, kind: 'self' });
    }
    for (const it of visibleInteractions()) {
      nodes.push({
        id: it.id, kind: 'interaction', title: `交互 ${it.date}`, project: it.project, cluster: it.cluster || '闲聊/未归类',
        clusterColor: clusterColor(it.cluster || '闲聊/未归类'), color: it.color, ageT: it.ageT ?? .5,
        importance: it.importance ?? .4, candidate: (it.candidateRefs || []).some((x) => x.status === 'pending'),
        hasFormal: (it.formalRefs || []).length > 0, date: it.date, x: it.x, y: it.y, z: it.z
      });
      edges.push({ a: 'core', b: it.id, kind: 'self' });
      for (const ref of it.formalRefs || []) {
        if (byId.has(ref)) edges.push({ a: it.id, b: ref, kind: 'interaction' });
      }
    }
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const e of LAYOUT?.semanticEdges || []) {
      if (nodeIds.has(e.a) && nodeIds.has(e.b)) edges.push({ a: e.a, b: e.b, kind: 'semantic', weight: e.weight });
    }
    for (const it of visibleInteractions()) {
      const anchor = LAYOUT?.nodes?.[it.id]?.anchor;
      if (anchor?.note && nodeIds.has(anchor.note)) edges.push({ a: it.id, b: anchor.note, kind: 'anchor', weight: anchor.score });
    }
    graph = { nodes, edges };
    EDGE_CURVES = new Map();
    byId = new Map(nodes.map((n) => [n.id, n]));
    adjacency = new Map(nodes.map((n) => [n.id, []]));
    for (const e of edges) {
      if (adjacency.has(e.a)) adjacency.get(e.a).push({ e, other: e.b });
      if (adjacency.has(e.b)) adjacency.get(e.b).push({ e, other: e.a });
    }
    updateFocus();
  }

  function applyData(data) {
    if (!data || !Array.isArray(data.notes)) return;
    const oldIds = new Set(NOTES.map((n) => n.id));
    const wasInitialized = initialized;
    DATA = data;
    LAYOUT = data.layout || null;
    COMMUNITY_COLORS.clear();
    for (const c of Object.values(LAYOUT?.communities || {})) if (c?.label && c?.color) COMMUNITY_COLORS.set(c.label, c.color);
    INTERACTIONS = Array.isArray(data.interactions) ? data.interactions.map((x) => ({ ...x, kind: 'interaction' })) : [];
    const indexed = new Set(INTERACTIONS.map((x) => `${x.session}:${x.seq}`));
    LIVE_STARS = LIVE_STARS.filter((x) => !indexed.has(`${x.session}:${x.seq}`));
    NOTES = data.notes.map((n) => ({ ...n }));
    NOTES.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.title).localeCompare(String(b.title)));
    rebuildPositions();
    if (wasInitialized) {
      const fresh = NOTES.filter((n) => !oldIds.has(n.id));
      for (const n of fresh.slice(-8)) birthStars.push({ id: n.id, start: performance.now() + 120, angle: Math.random() * Math.PI * 2, label: '记忆落位' });
    }
    initialized = true;
    if (selected && !NOTES.some((n) => n.id === selected) && !INTERACTIONS.some((n) => n.id === selected)) selected = null;
    buildGraph();
    refreshChrome();
    if (selected) renderDetail(NOTES.find((n) => n.id === selected));
    if (query) runSearch(false);
    status();
    if (!$('#profile-panel').hidden) renderProfile();
    if (!$('#story-panel').hidden) renderStory();
  }

  function status() {
    const visible = visibleNotes();
    const privateTotal = NOTES.filter((n) => n.privacy === 'private').length;
    $('#memory-count').textContent = visible.length;
    $('#story-count').textContent = (DATA.stories || []).length;
    const ints = visibleInteractions();
    const ib = $('#interaction-toggle');
    if (ib) ib.textContent = `交互 ${ints.length + LIVE_STARS.length} · ${interactionMode === 2 ? '全部' : '7天'}`;
    const ls = $('#layout-status');
    if (ls) ls.textContent = DATA.layout ? `布局 ${DATA.layout.layoutMode || '—'} · ${String(DATA.layout.generatedAt || '').slice(5, 16).replace('T', ' ')}` : '布局 —';
    $('#layer-count').textContent = `L1 ${NOTES.filter((n) => n.layer === 'L1').length} · L2 ${NOTES.filter((n) => n.layer === 'L2').length}`;
    $('#privacy-count').textContent = showPrivate ? `${privateTotal} 条私密已显示` : `${privateTotal} 条私密收起`;
    const btn = $('#private-toggle');
    btn.textContent = showPrivate ? '隐藏私密' : '显示私密';
    btn.setAttribute('aria-pressed', String(showPrivate));
    const lt = $('#label-toggle');
    lt.textContent = labelsCompact ? '标签：3团' : '标签：6团';
    lt.setAttribute('aria-pressed', String(!labelsCompact));
    const orient = $('#orientation-text');
    if (orient) orient.innerHTML = viewMode === 'sea'
      ? '颜色相近 = 语义相近。<br>同色聚在一起；越深越新，越淡越旧。'
      : '颜色相近 = 语义相近。<br>同色聚在一起；越深越新，越淡越旧。';
    const clusterLegend = $('#cluster-legend');
    if (clusterLegend) {
      if (viewMode === 'sea' && SEA_CLUSTERS.length) {
        clusterLegend.hidden = false;
        clusterLegend.innerHTML = '<span class="eyebrow">CLUSTERS</span>' + SEA_CLUSTERS.map((c) => `<div><i style="color:${c.color};background:${c.color}"></i><span>${esc(c.name)}</span><b>${interactionMode === 0 ? (c.formalCount ?? c.count) : c.count}</b></div>`).join('');
      } else {
        clusterLegend.hidden = true;
        clusterLegend.innerHTML = '';
      }
    }
    $('#status').textContent = LIVE
      ? (liveState === 'ok' ? '实时记忆 · 已同步' : liveState === 'error' ? '实时记忆 · 重连中' : '实时记忆 · 连接中')
      : '记忆快照 · 只读';
    const justLive = performance.now() - lastLiveAt < 2600;
    $('#live-note').textContent = LIVE
      ? (justLive ? '实时 · 刚刚划过一颗' : liveState === 'ok' ? '实时 · 事件流已连接' : liveState === 'error' ? '实时 · 重连中' : '实时 · 连接中')
      : '只读 · 快照';
    document.body.classList.toggle('live-error', LIVE && liveState === 'error');
    const rangeStart = NOTES.length ? NOTES[0].date : '—';
    const rangeEnd = NOTES.length ? NOTES[NOTES.length - 1].date : '—';
    $('#range-start').textContent = rangeStart;
    $('#range-end').textContent = rangeEnd;
    $('#range-count').textContent = visible.length === NOTES.length ? `${NOTES.length} 条` : `${visible.length} / ${NOTES.length} 条`;
  }

  function refreshChrome() {
    renderTimeline();
    status();
  }

  function renderTimeline() {
    const list = visibleNotes();
    $('#timeline').innerHTML = list.map((n) => `<button type="button" data-note="${esc(n.id)}" class="${selected === n.id ? 'active' : ''}"><time>${esc(n.date)}</time>${esc(n.title)}</button>`).join('') || '<span class="readonly-note">当前没有可见记忆</span>';
  }

  function matches(n, terms) {
    const hay = (n.title + ' ' + n.body + ' ' + (n.tags || []).join(' ') + ' ' + (n.people || []).join(' ') + ' ' + (n.project || '') + ' ' + n.date).toLowerCase();
    return terms.every((t) => hay.includes(t.toLowerCase()));
  }

  function runSearch(openPanel = true) {
    const q = $('#query').value.trim();
    query = q;
    if (!q) {
      results = [];
      $('#results').hidden = true;
      status();
      return;
    }
    const terms = q.split(/\s+/).filter(Boolean);
    results = visibleNotes().filter((n) => matches(n, terms)).sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title));
    $('#result-summary').textContent = results.length
      ? `“${q}” · 找到 ${results.length} 条记忆`
      : '没有找到匹配的记忆。可以换一个词，或显示私密记录。';
    $('#result-list').innerHTML = results.map((n) => `<button class="result-row ${selected === n.id ? 'current' : ''}" type="button" data-note="${esc(n.id)}">
      <strong>${esc(n.title)}</strong>
      <small>${esc(n.date)}${n.project ? ' · ' + esc(n.project) : ''}${n.privacy === 'private' ? ' · 私密' : ''}</small>
    </button>`).join('');
    if (openPanel) {
      selected = null;
      $('#inspector').hidden = true;
      $('#profile-panel').hidden = true;
      $('#profile-toggle').setAttribute('aria-pressed', 'false');
      $('#results').hidden = false;
    }
    status();
    renderTimeline();
  }

  function edgeKindLabel(kind) {
    return ({ related: '相关记忆', story: '故事', semantic: '语义近邻', anchor: '语义锚点', interaction: '来源交互', self: '核心', derived: '来源/派生', correction: '更正' })[kind] || kind || '关系';
  }
  function edgeKindColor(kind) {
    return ({ related: '#d9c79a', story: '#e7c47a', semantic: '#7fc7d9', anchor: '#e7c47a', interaction: '#d7e9ef', self: '#8fa9c8', correction: '#b9a7ef' })[kind] || '#c9b98f';
  }
  function updateFocus() {
    CONTEXT = { nodes: new Map(), edges: new Set() };
    if (!selected || selected === 'core' || !adjacency.has(selected)) return;
    const depth = Math.max(1, Math.min(2, focusDepth));
    const q = [{ id: selected, d: 0 }];
    CONTEXT.nodes.set(selected, 0);
    while (q.length) {
      const cur = q.shift();
      if (cur.d >= depth) continue;
      for (const { e, other } of adjacency.get(cur.id) || []) {
        if (!CONTEXT.nodes.has(other)) { CONTEXT.nodes.set(other, cur.d + 1); q.push({ id: other, d: cur.d + 1 }); }
        const da = CONTEXT.nodes.get(e.a), db = CONTEXT.nodes.get(e.b);
        if (da != null && db != null && da <= depth && db <= depth) CONTEXT.edges.add(e);
      }
    }
    // 一刀保底：上下文最多 30 个节点，避免核心节点拉出整张图
    if (CONTEXT.nodes.size > 30) {
      const keep = [...CONTEXT.nodes.entries()].sort((a, b) => a[1] - b[1]).slice(0, 30);
      CONTEXT.nodes = new Map(keep);
      CONTEXT.edges = new Set([...CONTEXT.edges].filter((e) => CONTEXT.nodes.has(e.a) && CONTEXT.nodes.has(e.b)));
    }
  }
  function contextHtml(id) {
    updateFocus();
    const seed = graph?.nodes?.find((n) => n.id === id);
    if (!seed) return '';
    const groups = new Map();
    for (const e of CONTEXT.edges) {
      const otherId = e.a === id ? e.b : e.b === id ? e.a : null;
      if (!otherId) continue;
      const other = byId.get(otherId);
      if (!other) continue;
      const kind = e.kind === 'self' ? 'core' : e.kind;
      if (!groups.has(kind)) groups.set(kind, new Map());
      groups.get(kind).set(otherId, { node: other, edge: e });
    }
    let html = '<div class="context-block"><div class="context-head"><h3>上下文关系</h3><button type="button" class="context-depth" data-focus-depth="1">' + (focusDepth >= 2 ? '收起两跳' : '展开两跳') + '</button></div>';
    if (!groups.size) html += '<p class="detail-note">暂无可展开关系；这条记忆仍是独立锚点。</p>';
    for (const [kind, items] of groups) {
      html += '<div class="context-group"><div class="context-kind" style="color:' + edgeKindColor(kind) + '">' + edgeKindLabel(kind) + ' · ' + items.size + '</div>';
      for (const { node } of [...items.values()].slice(0, 8)) {
        const isStory = node.kind === 'story';
        const isIt = node.kind === 'interaction';
        html += '<button class="context-row" type="button" data-context-id="' + esc(node.id) + '">' + (isStory ? '★ ' : isIt ? '◌ ' : '• ') + esc(node.title || node.id) + '</button>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function openNote(id) {
    const n = NOTES.find((x) => x.id === id);
    if (!n) return;
    if (n.privacy === 'private' && !showPrivate) {
      showPrivate = true;
      refreshChrome();
    }
    selected = id;
    $('#results').hidden = true;
    $('#profile-panel').hidden = true;
    $('#profile-toggle').setAttribute('aria-pressed', 'false');
    $('#story-panel').hidden = true;
    $('#story-toggle').setAttribute('aria-pressed', 'false');
    $('#inspector').hidden = false;
    renderDetail(n);
    updateFocus();
    startTransmission(id);
    $('#inspector').scrollTop = 0;
    renderTimeline();
  }

  function renderDetail(n) {
    const body = String(n.body || '').trim().split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('');
    const s = n.source || {};
    let src = `<b>${esc(s.channel || '未知')}</b>`;
    if (s.session) src += `<br>会话：${esc(s.session)}`;
    if (s.messages && s.messages.length) src += `<br>消息序号：${esc(s.messages.join(', '))}`;
    if (s.relatedSessions && s.relatedSessions.length) src += `<br>相关会话：${esc(s.relatedSessions.join(', '))}`;
    if (s.quote) src += `<br>原文引用：${esc(s.quote)}`;
    if (s.evidence && s.evidence.length) src += `<br>证据：${s.evidence.map(esc).join('<br>')}`;
    src += `<br>文件：${esc(n.file || '')}`;
    $('#detail').innerHTML = `<span class="eyebrow">${esc(n.date)} / ${esc(n.project || '无项目')}</span>
      <h2>${esc(n.title)}</h2>
      <div>
        ${n.privacy === 'private' ? '<span class="pill private">私密 · 仅本地</span>' : ''}
        ${n.nodeType ? `<span class="pill">${esc(n.nodeType)}</span>` : ''}
        ${n.lifecycle && n.lifecycle !== 'active' ? `<span class="pill">${esc(n.lifecycle)}</span>` : ''}
        ${(n.tags || []).map((t) => `<span class="pill">${esc(t)}</span>`).join('')}
      </div>
      ${contextHtml(n.id)}
      <div class="detail-body">${body}</div>
      ${n.story ? `<p class="detail-story">故事（养成注记）：${esc(n.story)}</p>` : ''}
      ${n.meaning ? `<p class="detail-note">这次之后（养成注记）：${esc(n.meaning)}</p>` : ''}
      <div class="meta">人物：${esc((n.people || []).join('、') || '—')}<br>重要度：${Math.round((n.importance || 0) * 100)}% · 强度：${Math.round((n.strength ?? n.importance ?? 0) * 100)}% · 置信度：${Math.round((n.confidence || 0) * 100)}%</div>
      <div class="source-box">${src}</div>
      <p class="detail-note">只读视图。记忆来自本地 Markdown；修改请回到记忆库，不在星图里直接改。</p>`;
  }

  function openInteraction(id) {
    const it = INTERACTIONS.find((x) => x.id === id) || LIVE_STARS.find((x) => x.id === id);
    if (!it) return;
    selected = id;
    $('#results').hidden = true;
    $('#profile-panel').hidden = true;
    $('#profile-toggle').setAttribute('aria-pressed', 'false');
    $('#story-panel').hidden = true;
    $('#story-toggle').setAttribute('aria-pressed', 'false');
    $('#inspector').hidden = false;
    const anchor = LAYOUT?.nodes?.[it.id]?.anchor;
    const anchorNote = anchor?.note ? NOTES.find((n) => n.id === anchor.note) : null;
    const formal = (it.formalRefs || []).map((rid) => NOTES.find((n) => n.id === rid)).filter(Boolean);
    const candidates = (it.candidateRefs || []).map((c) => `<span class="pill">候选 ${esc(c.status)}</span>`).join('');
    $('#detail').innerHTML = `<span class="eyebrow">${esc(it.date)} / 交互星 · ${esc(it.channel || '实时')}</span>
      <h2>一轮交互</h2>
      <div>${candidates}</div>
      <div class="detail-body"><p><b>你：</b>${esc(it.user || '')}</p><p><b>识海：</b>${esc(it.assistant || '（这轮没有保存回复）')}</p></div>
      <div class="meta">所属：${esc(it.cluster || '未归类')}<br>来源：${esc(it.channel)} / seq ${esc(it.seq)}<br>重要度：${Math.round((it.importance || 0) * 100)}%</div>
      ${contextHtml(it.id)}
      ${formal.length ? `<div class="section-note">已融入正式记忆：</div><div>${formal.map((n) => `<button class="pill" type="button" data-note="${esc(n.id)}">${esc(n.title)}</button>`).join(' ')}</div>` : '<p class="detail-note">这是交互记录，尚未提炼为正式 L1/L2。</p>'}
      ${anchorNote ? `<p class="detail-note">语义最近锚点：<button class="pill" type="button" data-note="${esc(anchorNote.id)}">${esc(anchorNote.title)}</button>（${Math.round((anchor.score || 0) * 100)}%）</p>` : ''}
      <p class="detail-note">交互星永久保留；点正式记忆可查看来源。</p>`;
    updateFocus();
    startTransmission(id);
    $('#inspector').scrollTop = 0;
  }

  function profileItems(title, items) {
    if (!items || !items.length) return '';
    return `<div class="profile-section"><h3>${esc(title)}</h3>${items.map((x) => `<div class="profile-item"><p>${esc(x.statement)}</p><div class="profile-evidence">${(x.evidence || []).map((e) => `<span>${esc(e)}</span>`).join('')}</div></div>`).join('')}</div>`;
  }

  function renderProfile() {
    const p = DATA.profile;
    const note = $('#profile-note');
    const detail = $('#profile-detail');
    if (!p) {
      note.textContent = '画像尚未生成。';
      detail.innerHTML = '';
      return;
    }
    note.textContent = p.note || 'L3 推导画像；不是逐字原文，冲突时以当前说法为准。';
    let html = '';
    html += profileItems('身份与背景', p.identity || []);
    html += profileItems('稳定偏好', p.preferences || []);
    html += profileItems('关系与起点', p.relationship || []);
    if (p.projects && p.projects.length) {
      html += `<div class="profile-section"><h3>正在做的事</h3>${p.projects.map((x) => `<div class="profile-project"><span>${esc(x.name)}</span><b>${esc(x.status || '')}</b></div>`).join('')}</div>`;
    }
    if (p.commitments && p.commitments.length) {
      html += profileItems('约定', p.commitments.map((x) => ({ statement: x.statement, evidence: x.evidence || [] })));
    }
    if (p.boundaries && p.boundaries.length) {
      html += `<div class="profile-section"><h3>边界</h3>${p.boundaries.map((x) => `<div class="profile-item"><p>${esc(x)}</p></div>`).join('')}</div>`;
    }
    if (DATA.health) {
      const h = DATA.health;
      const row = (k, v) => `<div class="profile-project"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
      html += `<div class="profile-section"><h3>记忆健康</h3>`;
      html += row('记忆 / 片段 / 原子', `${h.notes?.total ?? '—'} / ${h.notes?.L1 ?? '—'} / ${h.notes?.L2 ?? '—'}`);
      html += row('证据缺失 / 不匹配', `${h.evidence?.noEvidence ?? '—'} / ${h.evidence?.mismatch ?? '—'}`);
      if (h.lifecycle) html += row('生命周期 active / stale', `${h.lifecycle.active ?? '—'} / ${h.lifecycle.stale ?? '—'}`);
      if (h.strength) html += row('低强度待复习', `${h.strength.low ?? '—'} / 阈值 ${h.strength.lowThreshold ?? '—'}`);
      html += row('L1 缺“这次之后”', String(h.meaning?.l1NoMeaning ?? '—'));
      html += row('L1 有故事', String(h.meaning?.l1WithStory ?? '—'));
      html += row('待确认候选', String(h.candidates?.pending ?? '—'));
      if (h.recallEval) html += row('Recall@3 / 误注入', `${(h.recallEval.recallAt3 * 100).toFixed(0)}% / ${(h.recallEval.falseInjection * 100).toFixed(0)}%`);
      if (h.claims) html += row('L2 冲突 / 近重复', `${h.claims.conflicts} / ${h.claims.clusters}`);
      html += row('画像 / 图谱', `${h.profile?.stale ? '画像待更新' : '画像已同步'} · ${h.graph?.stale ? '图谱待更新' : '图谱已同步'}`);
      html += `</div>`;
    }
    detail.innerHTML = html;
  }

  function openProfile() {
    $('#inspector').hidden = true;
    $('#results').hidden = true;
    $('#story-panel').hidden = true;
    $('#story-toggle').setAttribute('aria-pressed', 'false');
    $('#profile-panel').hidden = false;
    renderProfile();
    $('#profile-panel').scrollTop = 0;
    $('#profile-toggle').setAttribute('aria-pressed', 'true');
  }

  function closeProfile() {
    $('#profile-panel').hidden = true;
    $('#profile-toggle').setAttribute('aria-pressed', 'false');
  }

  function renderStory() {
    const list = $('#story-list');
    const stories = DATA.stories || [];
    if (!stories.length) {
      list.innerHTML = '<p class="detail-note">故事集还没有条目。先让周仪式选出 1–3 条，再写成故事。</p>';
      return;
    }
    list.innerHTML = stories.map((s) => {
      const first = (s.related || [])[0] || '';
      return `<article class="story-card" id="story-${esc(s.id)}">
        <div class="story-meta">${esc(s.date || '')} · STORYBOOK</div>
        <h3>${esc(s.title || '')}</h3>
        ${s.quote ? `<div class="story-quote">“${esc(s.quote)}”</div>` : ''}
        <div class="story-body">${(s.body || []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        ${s.after ? `<div class="story-after">这次之后：${esc(s.after)}</div>` : ''}
        ${first ? `<button type="button" data-story-note="${esc(first)}">看相关记忆</button>` : ''}
      </article>`;
    }).join('');
  }

  function openStory(storyId = null) {
    $('#inspector').hidden = true;
    $('#results').hidden = true;
    $('#profile-panel').hidden = true;
    $('#profile-toggle').setAttribute('aria-pressed', 'false');
    $('#story-panel').hidden = false;
    renderStory();
    $('#story-panel').scrollTop = 0;
    $('#story-toggle').setAttribute('aria-pressed', 'true');
    if (storyId) requestAnimationFrame(() => {
      const card = document.getElementById('story-' + storyId);
      if (card) card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  function closeStory() {
    $('#story-panel').hidden = true;
    $('#story-toggle').setAttribute('aria-pressed', 'false');
  }

  function setLabels(compact) {
    labelsCompact = !!compact;
    status();
  }

  function glow(color) {
    if (sprites.has(color)) return sprites.get(color);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, '#fffdf5');
    g.addColorStop(.035, '#fff9ee');
    g.addColorStop(.1, /^#[0-9a-f]{3,6}$/i.test(color) ? color + 'df' : color);
    g.addColorStop(.25, color + '60');
    g.addColorStop(.5, color + '18');
    g.addColorStop(1, color + '00');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    sprites.set(color, c);
    return c;
  }

  function project(n) {
    const ca = Math.cos(yaw), sa = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rx = n.x * ca - n.z * sa;
    const rz = n.x * sa + n.z * ca;
    const ry = n.y * cp - rz * sp;
    const zz = n.y * sp + rz * cp;
    const perspective = 1050 / (1050 + zz);
    const unit = Math.min(width / 1030, (height - 100) / 610) * zoom;
    return { x: width * .51 + rx * perspective * unit, y: height * .465 + ry * perspective * unit, z: zz, k: perspective * unit };
  }

  function hitTest(px, py, radius) {
    const r = width < 700 ? Math.max(radius, 18) : radius;
    return projected.filter((p) => Math.hypot(p.x - px, p.y - py) < r).sort((a, b) => a.z - b.z)[0] || null;
  }

  const STARS = (() => {
    const rng = rand(31415);
    return Array.from({ length: 320 }, () => ({ x: rng(), y: rng(), z: rng(), r: rng() }));
  })();

  function resize() {
    width = innerWidth;
    height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 1.7);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function updatePause() {
    const b = $('#pause');
    b.textContent = paused ? '▷' : 'Ⅱ';
    b.setAttribute('aria-label', paused ? '继续动画' : '暂停动画');
    b.title = paused ? '继续动画（空格）' : '暂停动画（空格）';
  }

  function setPaused(value) {
    paused = !!value;
    if (!paused) orbit = true;
    updatePause();
  }

  function togglePause() {
    setPaused(!paused);
  }

  function drawLabels(projectedNodes, hot) {
    const occupied = labelBoxes.slice();
    const list = projectedNodes.filter((p) => p.n.kind === 'memory' || p.n.kind === 'story').sort((a, b) => Number(hot.has(b.n.id)) - Number(hot.has(a.n.id)));
    for (const p of list) {
      const n = p.n;
      const isStory = n.kind === 'story';
      const ctxDepth = selected ? CONTEXT.nodes.get(n.id) : null;
      const important = selected === n.id || hover === n.id || (query && hot.has(n.id)) || ctxDepth === 1;
      if (!important) continue;
      const raw = `${n.date.slice(5).replace('-', '/')}  ${n.title}`;
      const label = raw.length > 22 ? raw.slice(0, 21) + '…' : raw;
      const font = important ? 12 : 10;
      ctx.font = `${font}px "Microsoft YaHei", sans-serif`;
      const tw = ctx.measureText(label).width;
      const x = p.x + 9;
      const y = p.y - 8;
      const rect = { x: x - 3, y: y - 12, w: tw + 6, h: 16 };
      const topLimit = width < 700 ? 128 : 148;
      const bottomLimit = width < 700 ? 155 : 112;
      if (x < 14 || x + tw > width - 20 || y < topLimit || y > height - bottomLimit) continue;
      if (!important && occupied.some((r) => rect.x < r.x + r.w && rect.x + rect.w > r.x && rect.y < r.y + r.h && rect.y + rect.h > r.y)) continue;
      occupied.push(rect);
      ctx.fillStyle = 'rgba(3,9,16,.68)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = important ? '#f6dfb4' : '#91a6bb';
      ctx.globalAlpha = important ? 1 : .78;
      ctx.fillText(label, x, y);
      ctx.globalAlpha = 1;
    }
  }

  function clusterScreen(list, c) {
    const pts = list.filter((p) => p.n.cluster === c.name);
    if (pts.length < 2) return null;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { pts, cx, cy, rx: Math.max(34, (x1 - x0) / 2 + 24), ry: Math.max(28, (y1 - y0) / 2 + 20) };
  }

  function drawInteractionStars(list, hot, now) {
    for (const p of list) {
      const n = p.n;
      if (n.kind !== 'interaction') continue;
      const isFocus = selected === n.id || hover === n.id;
      let alpha = .16 + .62 * (n.ageT ?? .5);
      if (query && !hot.has(n.id)) alpha *= .22;
      if (selected) {
        const d = CONTEXT.nodes.get(n.id);
        if (d === 0) alpha = 1;
        else if (d != null) alpha = Math.max(alpha, d === 1 ? .8 : .48);
        else alpha *= .18;
      }
      const tone = agedColor(n);
      const r = Math.max(.65, (1.05 + (n.importance || .4) * 1.2) * p.k);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * .28;
      ctx.drawImage(glow(tone), p.x - 7, p.y - 7, 14, 14);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = tone;
      ctx.beginPath(); ctx.arc(p.x - 1.4 * p.k, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d7e9ef';
      ctx.beginPath(); ctx.arc(p.x + 1.2 * p.k, p.y - .4, r * .58, 0, Math.PI * 2); ctx.fill();
      if (n.candidate) {
        ctx.globalAlpha = alpha * .9;
        ctx.strokeStyle = '#e7c47a';
        ctx.lineWidth = .65;
        ctx.setLineDash([1.2, 2.2]);
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 2.4 * p.k, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (isFocus) {
        ctx.globalAlpha = .7;
        ctx.strokeStyle = '#f0d39a';
        ctx.lineWidth = .8;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 5.5 * p.k, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawClusterMist(list) {
    for (const c of SEA_CLUSTERS) {
      if (!c.major) continue;
      const s = clusterScreen(list, c);
      if (!s || s.pts.length < 1) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(s.cx, s.cy);
      ctx.scale(s.rx * 1.15, s.ry * 1.15);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, c.color);
      g.addColorStop(.42, c.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = .18;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // 主色团保留密集虚线圆；小团不画，避免叠成星盘。
      ctx.save();
      ctx.strokeStyle = c.color;
      ctx.globalAlpha = .46;
      ctx.lineWidth = .9;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.ellipse(s.cx, s.cy, s.rx, s.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = c.color;
      ctx.globalAlpha = .095;
      ctx.lineWidth = .75;
      ctx.beginPath();
      for (const p of s.pts) { ctx.moveTo(s.cx, s.cy); ctx.lineTo(p.x, p.y); }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawClusterAuras(list) {
    for (const c of SEA_CLUSTERS) {
      const s = clusterScreen(list, c);
      if (!s || s.pts.length < 2) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(s.cx, s.cy);
      ctx.scale(s.rx, s.ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, c.color);
      g.addColorStop(.45, c.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = .12;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = c.color;
      ctx.globalAlpha = .28;
      ctx.lineWidth = .8;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.ellipse(s.cx, s.cy, s.rx, s.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = .07;
      ctx.beginPath();
      for (const p of s.pts) { ctx.moveTo(s.cx, s.cy); ctx.lineTo(p.x, p.y); }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawClusterLabels(list) {
    const occupied = [];
    const maxLabels = width < 700 ? 2 : (labelsCompact ? 3 : 6);
    for (const c of SEA_CLUSTERS.filter((x) => x.major).slice().sort((a, b) => b.count - a.count).slice(0, maxLabels)) {
      const s = clusterScreen(list, c);
      if (!s || s.pts.length < 3) continue;
      if (s.cx < 255 || s.cx > width - 190) continue;
      const label = c.name.length > (width < 700 ? 7 : 12) ? c.name.slice(0, width < 700 ? 6 : 11) + '…' : c.name;
      ctx.font = `${width < 700 ? 10 : 11}px "Bahnschrift", "Microsoft YaHei UI", sans-serif`;
      const tw = ctx.measureText(label).width;
      const x = s.cx - tw / 2 - 7;
      const y = s.cy - s.ry - 25;
      const rect = { x, y, w: tw + 34, h: 18 };
      if (y < 128 || y > height - 120) continue;
      if (occupied.some((r) => rect.x < r.x + r.w && rect.x + rect.w > r.x && rect.y < r.y + r.h && rect.y + rect.h > r.y)) continue;
      occupied.push(rect);
      labelBoxes.push(rect);
      ctx.globalAlpha = .82;
      ctx.fillStyle = 'rgba(4,11,20,.82)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = c.color;
      ctx.globalAlpha = .42;
      ctx.strokeRect(rect.x + .5, rect.y + .5, rect.w - 1, rect.h - 1);
      ctx.globalAlpha = .96;
      ctx.fillStyle = c.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, s.cx, y + 9);
      ctx.globalAlpha = .6;
      ctx.font = '9px "Cascadia Mono", Consolas, monospace';
      const shownCount = c.count;
      ctx.fillText(String(shownCount), x + rect.w - 11, y + 9);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.globalAlpha = 1;
  }

  function curveFor(e) {
    if (EDGE_CURVES.has(e)) return EDGE_CURVES.get(e);
    const a = byId.get(e.a), b = byId.get(e.b);
    if (!a || !b) return null;
    const va = [a.x || 0, a.y || 0, a.z || 0];
    const vb = [b.x || 0, b.y || 0, b.z || 0];
    const la = Math.hypot(...va), lb = Math.hypot(...vb);
    const dist = Math.hypot(va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]);
    const pts = [];
    if (la < 8 || lb < 8) {
      for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t, va[2] + (vb[2] - va[2]) * t]); }
    } else {
      const ua = va.map((x) => x / la), ub = vb.map((x) => x / lb);
      let dot = ua[0] * ub[0] + ua[1] * ub[1] + ua[2] * ub[2];
      dot = Math.max(-1, Math.min(1, dot));
      const ang = Math.acos(dot);
      const bow = 8 + Math.min(44, dist * .09);
      for (let i = 0; i <= 32; i++) {
        const t = i / 32;
        let d;
        if (ang < .002) d = ua.map((x, k) => x * (1 - t) + ub[k] * t);
        else {
          const s0 = Math.sin((1 - t) * ang) / Math.sin(ang);
          const s1 = Math.sin(t * ang) / Math.sin(ang);
          d = ua.map((x, k) => x * s0 + ub[k] * s1);
        }
        const ln = Math.hypot(...d) || 1;
        const radius = la * (1 - t) + lb * t + Math.sin(Math.PI * t) * bow;
        pts.push([d[0] / ln * radius, d[1] / ln * radius, d[2] / ln * radius]);
      }
    }
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    const curve = { pts, acc, len: acc[acc.length - 1] || 1 };
    EDGE_CURVES.set(e, curve);
    return curve;
  }
  function screenCurve(e) {
    const c = curveFor(e);
    if (!c) return [];
    return c.pts.map((p) => project({ x: p[0], y: p[1], z: p[2] }));
  }
  function curveAt(e, t) {
    const c = curveFor(e);
    if (!c) return null;
    const target = Math.max(0, Math.min(1, t)) * c.len;
    let i = 1;
    while (i < c.acc.length && c.acc[i] < target) i++;
    const p0 = c.pts[Math.max(0, i - 1)], p1 = c.pts[Math.min(c.pts.length - 1, i)];
    const seg = (c.acc[Math.min(i, c.acc.length - 1)] - c.acc[Math.max(0, i - 1)]) || 1;
    const u = Math.max(0, Math.min(1, (target - c.acc[Math.max(0, i - 1)]) / seg));
    return project({ x: p0[0] + (p1[0] - p0[0]) * u, y: p0[1] + (p1[1] - p0[1]) * u, z: p0[2] + (p1[2] - p0[2]) * u });
  }

  function startTransmission(seed) {
    TRANSMISSION = { seed: null, start: 0, signals: [] };
    if (!seed || seed === 'core' || !CONTEXT.nodes.has(seed)) return;
    const signals = [];
    const visited = new Set([seed]);
    const used = new Set();
    const queue = [{ id: seed, at: 0 }];
    while (queue.length && signals.length < 64) {
      queue.sort((a, b) => a.at - b.at);
      const cur = queue.shift();
      for (const { e, other } of adjacency.get(cur.id) || []) {
        if (!CONTEXT.edges.has(e) || used.has(e) || !CONTEXT.nodes.has(other) || visited.has(other)) continue;
        used.add(e);
        const c = curveFor(e);
        if (!c) continue;
        const start = cur.at + SIGNAL_DWELL;
        const duration = Math.max(.16, c.len / SIGNAL_SPEED);
        const arrival = start + duration;
        signals.push({ e, from: cur.id, to: other, start, duration, arrival, kind: e.kind });
        visited.add(other);
        queue.push({ id: other, at: arrival });
      }
    }
    TRANSMISSION = { seed, start: time, signals };
  }
  function drawTransmission(nowSec) {
    if (!selected || TRANSMISSION.seed !== selected || !TRANSMISSION.signals.length) return;
    const base = nowSec - TRANSMISSION.start;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const sig of TRANSMISSION.signals) {
      const t = (base - sig.start) / sig.duration;
      if (t < 0 || t > 1.25) continue;
      const tone = edgeKindColor(sig.kind === 'self' ? 'core' : sig.kind);
      if (t >= 0 && t <= 1) {
        const p = curveAt(sig.e, t);
        if (p) {
          ctx.globalAlpha = .85;
          ctx.fillStyle = tone;
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.1 * p.k, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = .22;
          const size = 18 * p.k;
          ctx.drawImage(glow(tone), p.x - size / 2, p.y - size / 2, size, size);
          const trailStart = Math.max(0, t - .16);
          ctx.strokeStyle = tone;
          ctx.lineWidth = 1.1;
          ctx.globalAlpha = .55;
          const trail = [];
          for (let k = 0; k <= 6; k++) {
            const q = curveAt(sig.e, trailStart + (t - trailStart) * k / 6);
            if (q) trail.push(q);
          }
          ctx.beginPath();
          traceCurve(ctx, trail);
          ctx.stroke();
        }
      }
      if (t >= 1 && t < 1.25) {
        const end = curveAt(sig.e, 1);
        if (end) {
          const u = Math.min(1, (t - 1) / .25);
          ctx.globalAlpha = (1 - u) * .65;
          ctx.strokeStyle = tone;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(end.x, end.y, (4 + u * 12) * end.k, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function traceCurve(ctx, path) {
    if (!path || path.length < 2) return;
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 0; i < path.length - 1; i++) {
      const p0 = path[Math.max(0, i - 1)];
      const p1 = path[i];
      const p2 = path[i + 1];
      const p3 = path[Math.min(path.length - 1, i + 2)];
      ctx.bezierCurveTo(
        p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
        p2.x, p2.y
      );
    }
  }

  function render(now) {
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    if (!paused) {
      time += dt;
      if (orbit && !drag) yaw += dt * .025;
    }
    zoom += (zoomTarget - zoom) * .08;

    const hot = new Set();
    if (query) results.forEach((n) => hot.add(n.id));
    if (selected) hot.add(selected);
    if (hover) hot.add(hover);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#030810';
    ctx.fillRect(0, 0, width, height);
    const bg = ctx.createRadialGradient(width * .52, height * .43, 10, width * .52, height * .43, width * .55);
    bg.addColorStop(0, '#0e2134');
    bg.addColorStop(.5, '#07111e');
    bg.addColorStop(1, '#030810');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#a1bbcf';
    for (const s of STARS) {
      ctx.globalAlpha = (.05 + s.z * .16) * (.85 + .15 * Math.sin(time * .3 + s.x * 20));
      ctx.beginPath();
      ctx.arc(s.x * width + Math.sin(yaw * .2 + s.y) * s.z * 8, s.y * height, s.r > .96 ? 1.1 : .5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    projected = graph.nodes.map((n) => ({ ...project(n), n })).sort((a, b) => b.z - a.z);
    const ps = new Map(projected.map((p) => [p.n.id, p]));
    const core = ps.get('core');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const e of graph.edges) {
      const a = ps.get(e.a);
      const b = ps.get(e.b);
      if (!a || !b) continue;
      let alpha = e.kind === 'self' ? .032 : e.kind === 'time' ? .065 : e.kind === 'cluster' ? .04 : e.kind === 'story' ? .24 : e.kind === 'semantic' ? .055 : e.kind === 'anchor' ? .09 : e.kind === 'interaction' ? .07 : .16;
      let width = .5;
      const incident = !!selected && (e.a === selected || e.b === selected);
      const inContext = !!selected && CONTEXT.edges.has(e);
      if (selected && selected !== 'core') {
        if (incident) { alpha = Math.max(alpha, e.kind === 'self' ? .24 : .72); width = 1.25; }
        else if (inContext) { alpha = Math.max(alpha, .28); width = .8; }
        else { alpha *= .18; width = .32; }
      } else if (query && !(hot.has(e.a) || hot.has(e.b))) alpha *= .22;
      ctx.strokeStyle = incident || inContext ? edgeKindColor(e.kind === 'self' ? 'core' : e.kind) : e.kind === 'story' ? '#e7c47a' : e.kind === 'self' ? '#c6d5e8' : '#c9b98f';
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      const path = screenCurve(e);
      if (!path.length) continue;
      ctx.beginPath();
      traceCurve(ctx, path);
      ctx.stroke();
    }

    if (viewMode === 'sea') drawClusterMist(projected);
    const nowMs = performance.now();
    drawInteractionStars(projected, hot, nowMs);
    for (const p of projected) {
      const n = p.n;
      if (n.kind === 'core' || n.kind === 'interaction') continue;
      const birth = birthStars.find((b) => b.id === n.id);
      if (birth && nowMs - birth.start < 1450) continue;
      const isHot = hot.has(n.id);
      const isFocus = selected === n.id || hover === n.id;
      let alpha = .9;
      if (query && !isHot) alpha *= .2;
      if (selected) {
        const d = CONTEXT.nodes.get(n.id);
        if (d === 0) alpha = 1;
        else if (d != null) alpha = Math.max(alpha, d === 1 ? .82 : .5);
        else alpha *= .16;
      }
      alpha *= Math.max(.5, 1 - p.z / 900);
      const layer = n.layer;
      const isStory = n.kind === 'story';
      if (!isStory) alpha *= .38 + .62 * (n.ageT ?? .5);
      const tone = isStory ? '#f5dc9f' : isHot ? '#fff5da' : agedColor(n);
      const strength = isStory ? .95 : (n.strength ?? n.importance ?? .5);
      const baseR = isStory
        ? 5.6 + strength * 1.6
        : layer === 'L1'
          ? 2.0 + strength * 2.8
          : layer === 'L2'
            ? 2.8 + strength * 3.4
            : 2.4 + strength * 3.2;
      const r = baseR * p.k;
      if (isStory || isHot || strength > .85) {
        const size = (isStory ? 42 : isHot ? 28 : 15) * p.k;
        ctx.globalAlpha = alpha * (isStory ? .75 : isHot ? .7 : .26);
        ctx.drawImage(glow(isStory ? '#e7c47a' : isHot ? '#f7dba6' : tone), p.x - size / 2, p.y - size / 2, size, size);
      } else {
        const size = (12 + strength * 8) * p.k;
        ctx.globalAlpha = alpha * .16;
        ctx.drawImage(glow(tone), p.x - size / 2, p.y - size / 2, size, size);
      }
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillStyle = tone;
      if (isStory) {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 4;
          const rr = i % 2 === 0 ? r * 1.35 : r * .48;
          const px = p.x + Math.cos(a) * rr, py = p.y + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
      } else if (layer === 'L2') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
        const side = Math.max(1.2, r * 1.28);
        ctx.fillRect(-side / 2, -side / 2, side, side);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(.7, r), 0, Math.PI * 2);
        ctx.fill();
      }
      if (viewMode === 'sea' && n.clusterColor) {
        ctx.globalAlpha = Math.min(1, alpha * .34);
        ctx.strokeStyle = n.clusterColor;
        ctx.lineWidth = .55;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 2.2 * p.k, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (isStory || isHot || strength > .85) {
        ctx.strokeStyle = isStory ? '#f0d39a' : isHot ? '#f9d7a0' : tone;
        ctx.lineWidth = isStory ? 1 : .65;
        ctx.globalAlpha = alpha * .8;
        if (n.privacy === 'private') ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + (isStory ? 8 : isHot ? 5 : 3) * p.k, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (isFocus) {
        const pulse = (time * .4) % 1;
        ctx.globalAlpha = .48 * (1 - pulse);
        ctx.lineWidth = .8;
        ctx.strokeStyle = '#edd39e';
        ctx.beginPath();
        ctx.arc(p.x, p.y, (9 + pulse * 19) * p.k, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    drawTransmission(time);
    drawBirthStars(nowMs, ps);
    labelBoxes = [];
    if (viewMode === 'sea' && width >= 700) drawClusterLabels(projected);
    const breath = 1 + .08 * Math.sin(time * 1.7);
    const size = 168 * core.k * breath;
    ctx.globalAlpha = .98;
    ctx.drawImage(glow('#e8dbbb'), core.x - size / 2, core.y - size / 2, size, size);
    for (let i = 0; i < 10; i++) {
      const ang = i / 10 * Math.PI * 2 + time * .02;
      const len = (i % 2 ? 28 : 54) * core.k;
      const g = ctx.createLinearGradient(core.x, core.y, core.x + Math.cos(ang) * len, core.y + Math.sin(ang) * len);
      g.addColorStop(0, '#fff7df');
      g.addColorStop(1, '#ffe5b000');
      ctx.strokeStyle = g;
      ctx.globalAlpha = .6;
      ctx.lineWidth = i % 2 ? .6 : 1;
      ctx.beginPath();
      ctx.moveTo(core.x, core.y);
      ctx.lineTo(core.x + Math.cos(ang) * len, core.y + Math.sin(ang) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff9e8';
    ctx.beginPath();
    ctx.arc(core.x, core.y, 4.2 * core.k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();


    drawLabels(projected, hot);
    drawLiveTransients(now);
    requestAnimationFrame(render);
  }

  function drawBirthStars(now, ps) {
    if (!birthStars.length) return;
    birthStars = birthStars.filter((b) => now - b.start < 2600);
    for (const b of birthStars) {
      const p = ps.get(b.id);
      if (!p) continue;
      const t = Math.max(0, Math.min(1, (now - b.start) / 1450));
      const ease = 1 - Math.pow(1 - t, 3);
      const maxR = Math.max(width, height) * .7;
      const fromX = width / 2 + Math.cos(b.angle) * maxR;
      const fromY = height / 2 + Math.sin(b.angle) * maxR * .65;
      const x = fromX + (p.x - fromX) * ease;
      const y = fromY + (p.y - fromY) * ease;
      const alpha = t < .9 ? 1 : Math.max(0, (1 - t) / .1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha;
      const tail = 40 + t * 130;
      const tx = x - Math.cos(b.angle) * tail;
      const ty = y - Math.sin(b.angle) * tail * .5;
      const g = ctx.createLinearGradient(tx, ty, x, y);
      g.addColorStop(0, 'rgba(126,214,224,0)');
      g.addColorStop(.55, 'rgba(126,214,224,.32)');
      g.addColorStop(1, 'rgba(246,222,168,.95)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      const halo = ctx.createRadialGradient(x, y, 0, x, y, 30);
      halo.addColorStop(0, 'rgba(255,247,220,.92)');
      halo.addColorStop(.25, 'rgba(241,206,143,.44)');
      halo.addColorStop(1, 'rgba(241,206,143,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6df'; ctx.beginPath(); ctx.arc(x, y, 3.1, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = alpha * .75; ctx.fillStyle = '#eed8aa'; ctx.font = '9px "Cascadia Mono", Consolas, monospace';
      ctx.fillText('记忆落位', x + 9, y - 9);
      if (t >= 1) {
        const pulse = Math.min(1, (now - b.start - 1450) / 1100);
        ctx.globalAlpha = (1 - pulse) * .6; ctx.strokeStyle = '#f0d39a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 8 + pulse * 34, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawLiveTransients(now) {
    if (!liveTransients.length) return;
    const cx = width / 2, cy = height / 2;
    const maxR = Math.max(width, height) * .62;
    liveTransients = liveTransients.filter((e) => now - e.start < 2100);
    for (const e of liveTransients) {
      const t = Math.min(1, (now - e.start) / 1800);
      const ease = 1 - Math.pow(1 - t, 3);
      const fromX = cx + Math.cos(e.angle) * maxR;
      const fromY = cy + Math.sin(e.angle) * maxR * .66;
      const toX = cx + Math.cos(e.angle) * (48 + e.jitter);
      const toY = cy + Math.sin(e.angle) * (34 + e.jitter * .7);
      const cluster = SEA_CLUSTERS.find((c) => c.name === e.project);
      const target = cluster ? project(cluster) : null;
      const endX = target ? target.x : toX;
      const endY = target ? target.y : toY;
      const x = fromX + (endX - fromX) * ease;
      const y = fromY + (endY - fromY) * ease;
      const alpha = t < .82 ? 1 : Math.max(0, (1 - t) / .18);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * (1 - t * .25);
      const tail = Math.min(180, 28 + t * 190);
      const tx = x - Math.cos(e.angle) * tail;
      const ty = y - Math.sin(e.angle) * tail * .55;
      const g = ctx.createLinearGradient(tx, ty, x, y);
      g.addColorStop(0, 'rgba(126,214,224,0)');
      g.addColorStop(.55, 'rgba(126,214,224,.36)');
      g.addColorStop(1, 'rgba(246,222,168,.95)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      const halo = ctx.createRadialGradient(x, y, 0, x, y, 26);
      halo.addColorStop(0, 'rgba(255,244,214,.8)');
      halo.addColorStop(.22, 'rgba(241,206,143,.38)');
      halo.addColorStop(1, 'rgba(241,206,143,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff5db';
      ctx.beginPath(); ctx.arc(x, y, 2.2 + (1 - t) * 1.6, 0, Math.PI * 2); ctx.fill();
      if (t < .62) {
        ctx.globalAlpha = alpha * .82;
        ctx.fillStyle = '#b9d9e2';
        ctx.font = '9px "Cascadia Mono", Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(e.label || '新交互', x + 8, y - 8);
      }
      if (t > .82) {
        const r = 8 + (t - .82) * 48;
        ctx.globalAlpha = Math.max(0, (1 - t) / .18) * .5;
        ctx.strokeStyle = '#e7c47a';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(endX, endY, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function addLiveTransient(ev) {
    const angle = (Math.random() * .9 + .55) * Math.PI;
    liveTransients.push({ start: performance.now(), angle, jitter: Math.random() * 34, label: ev.label || '新交互', project: ev.project || '' });
    if (liveTransients.length > 12) liveTransients.shift();
    lastLiveAt = performance.now();
    status();
  }

  function startLiveStream() {
    if (!LIVE || typeof EventSource === 'undefined') return;
    try {
      liveStream = new EventSource('/api/live');
      liveStream.addEventListener('open', () => { liveState = 'ok'; status(); });
      liveStream.addEventListener('interaction', (msg) => {
        try { const ev = JSON.parse(msg.data); applyLiveEvent(ev); } catch {}
      });
      liveStream.addEventListener('memory', () => { poll(); });
      liveStream.onerror = () => { liveState = 'error'; status(); };
    } catch { liveState = 'error'; status(); }
  }

  function addLiveStar(ev) {
    const project = ev.project || '';
    const wanted = projectAlias(project) || '其他项目';
    const cluster = SEA_CLUSTERS.find((c) => c.name === wanted) || SEA_CLUSTERS.find((c) => c.name === '其他项目') || SEA_CLUSTERS[0];
    if (!cluster) return;
    const key = ev.session && ev.seq != null ? `${ev.session}:${ev.seq}` : (ev.id || ('live:' + Date.now()));
    if (LIVE_STARS.some((x) => x.key === key)) return;
    const rng = rand(hash(String(ev.id || key) + ':live'));
    const x = (cluster.x || 0) + (rng() - .5) * 46;
    const y = (cluster.y || 0) + (rng() - .5) * 46;
    const z = (cluster.z || 0) + (rng() - .5) * 34;
    const date = (ev.time ? new Date(ev.time) : new Date()).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
    LIVE_STARS.push({
      id: 'live_' + (ev.id || crypto.randomUUID()), key, session: ev.session || '', seq: ev.seq ?? null,
      date, title: ev.label || '新交互', project, cluster: cluster.name,
      color: clusterColor(cluster.name), x, y, z, ageT: 1, importance: .55, candidate: false, provisional: true
    });
    if (LIVE_STARS.length > 100) LIVE_STARS.shift();
    buildGraph();
    status();
  }

  function applyLiveEvent(ev) {
    addLiveTransient(ev);
    addLiveStar(ev);
    // 正式记忆更新由 memory 事件触发；这里收到交互事件时也轻量刷新一次。
    setTimeout(() => poll(), 700);
  }

  async function poll() {
    if (!LIVE) return;
    try {
      const res = await fetch('/api/memory', { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      liveState = 'ok';
      if (data.version && data.version !== DATA.version) applyData(data);
      else status();
    } catch {
      liveState = 'error';
      status();
    }
  }

  function bind() {
    $('#private-toggle').addEventListener('click', () => {
      showPrivate = !showPrivate;
      if (!showPrivate && selected && NOTES.find((n) => n.id === selected)?.privacy === 'private') {
        selected = null;
        $('#inspector').hidden = true;
      }
      refreshChrome();
    });
    $('#timeline').addEventListener('click', (e) => {
      const b = e.target.closest('[data-note]');
      if (b) openNote(b.dataset.note);
    });
    $('#result-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-note]');
      if (b) openNote(b.dataset.note);
    });
    $('#detail').addEventListener('click', (e) => {
      const depth = e.target.closest('[data-focus-depth]');
      if (depth) {
        focusDepth = focusDepth >= 2 ? 1 : 2;
        if (selected && NOTES.some((n) => n.id === selected)) openNote(selected);
        else if (selected && (INTERACTIONS.some((n) => n.id === selected) || LIVE_STARS.some((n) => n.id === selected))) openInteraction(selected);
        return;
      }
      const ctx = e.target.closest('[data-context-id]');
      if (ctx) {
        const id = ctx.dataset.contextId;
        if (NOTES.some((n) => n.id === id)) openNote(id);
        else if (INTERACTIONS.some((n) => n.id === id) || LIVE_STARS.some((n) => n.id === id)) openInteraction(id);
        else if ((DATA.stories || []).some((s) => s.id === id)) openStory(id);
        return;
      }
      const b = e.target.closest('[data-note]');
      if (b) openNote(b.dataset.note);
    });
    $('#close-inspector').addEventListener('click', () => { selected = null; $('#inspector').hidden = true; renderTimeline(); });
    $('#close-results').addEventListener('click', () => { $('#results').hidden = true; selected = null; renderTimeline(); });
    $('#profile-toggle').addEventListener('click', () => { if ($('#profile-panel').hidden) openProfile(); else closeProfile(); });
    $('#close-profile').addEventListener('click', closeProfile);
    $('#story-toggle').addEventListener('click', () => { if ($('#story-panel').hidden) openStory(); else closeStory(); });
    $('#close-story').addEventListener('click', closeStory);
    $('#story-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-story-note]');
      if (b) { closeStory(); openNote(b.dataset.storyNote); }
    });
    $('#label-toggle').addEventListener('click', () => setLabels(!labelsCompact));
    const lr = $('#layout-rebuild');
    if (lr) lr.addEventListener('click', async () => {
      lr.disabled = true; lr.textContent = '重排中…';
      try { await fetch('/api/layout/rebuild', { method: 'POST' }); } catch {}
      setTimeout(async () => { await poll(); lr.disabled = false; lr.textContent = '重排'; }, 1800);
    });
    $('#interaction-toggle').addEventListener('click', () => {
      interactionMode = interactionMode === 1 ? 2 : 1;
      if (selected && !NOTES.some((n) => n.id === selected) && !visibleInteractions().some((n) => n.id === selected)) selected = null;
      buildGraph();
      status();
    });
    $('#recall-form').addEventListener('submit', (e) => { e.preventDefault(); runSearch(true); });
    $('#zoom-in').addEventListener('click', () => { zoomTarget = Math.min(2.5, zoomTarget * 1.18); });
    $('#zoom-out').addEventListener('click', () => { zoomTarget = Math.max(.55, zoomTarget / 1.18); });
    $('#home').addEventListener('click', () => { yaw = .15; pitch = .13; zoomTarget = 1; orbit = true; });
    $('#pause').addEventListener('click', togglePause);

    canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, moved: false };
      try { canvas.setPointerCapture(e.pointerId); } catch {}
    });
    canvas.addEventListener('pointermove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(e.clientX - drag.ox, e.clientY - drag.oy) > 4) {
          drag.moved = true;
          orbit = false;
        }
        if (drag.moved) {
          yaw += dx * .005;
          pitch = Math.max(-1, Math.min(1, pitch + dy * .004));
        }
        drag.x = e.clientX;
        drag.y = e.clientY;
      } else {
        const hit = hitTest(e.clientX, e.clientY, 12);
        hover = hit ? hit.n.id : null;
        canvas.style.cursor = hover ? 'pointer' : 'grab';
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (drag) {
        if (!drag.moved) {
          const hit = hitTest(e.clientX, e.clientY, 14);
          if (hit) {
            if (hit.n.kind === 'story') openStory(hit.n.id);
            else if (hit.n.kind === 'interaction') openInteraction(hit.n.id);
            else openNote(hit.n.id);
          } else { selected = null; $('#inspector').hidden = true; renderTimeline(); }
        }
        drag = null;
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
      }
    });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('pointerleave', () => { hover = null; });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomTarget = Math.max(.55, Math.min(2.5, zoomTarget * Math.exp(-e.deltaY * .001)));
    }, { passive: false });
    addEventListener('resize', resize);
    document.addEventListener('keydown', (e) => {
      const tag = e.target?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        e.preventDefault();
        togglePause();
      }
      if (e.key === 'Escape') {
        selected = null;
        $('#inspector').hidden = true;
        $('#results').hidden = true;
        closeProfile();
        closeStory();
        renderTimeline();
      }
    });
  }

  resize();
  updatePause();
  bind();
  applyData(DATA);
  if (LIVE) { startLiveStream(); setTimeout(poll, 200); setInterval(poll, 8000); }
  const lb = $('#live-banner');
  if (lb) lb.hidden = LIVE;
  requestAnimationFrame(render);

  window.ShihaiView = {
    setPrivate(v) {
      showPrivate = !!v;
      if (!showPrivate && selected && NOTES.find((n) => n.id === selected)?.privacy === 'private') {
        selected = null;
        $('#inspector').hidden = true;
      }
      refreshChrome();
    },
    search(q) { $('#query').value = q || ''; runSearch(true); },
    focus(id) { openNote(id); },
    profile() { openProfile(); },
    closeProfile,
    story() { openStory(); },
    closeStory,
    labels(compact) { setLabels(compact); },
    camera(y, p, z) { yaw = y; pitch = p; zoom = z; zoomTarget = z; },
    clusterColors() { return SEA_CLUSTERS.map((c) => ({ name: c.name, color: c.color, count: c.count })); },
    animate(v) { setPaused(!v); },
    refreshLive() { return poll(); },
    liveEvents() { return liveTransients.length; },
    births() { return birthStars.length; },
    injectLive(label = '测试交互', project = '识海') { applyLiveEvent({ label, project, id: crypto.randomUUID(), session: 'test', seq: Date.now() }); },
    view() {
      return {
        live: LIVE,
        status: liveState,
        total: NOTES.length,
        visible: visibleNotes().length,
        privateTotal: NOTES.filter((n) => n.privacy === 'private').length,
        stories: (DATA.stories || []).length,
        mode: viewMode,
        layers: {
          L1: NOTES.filter((n) => n.layer === 'L1').length,
          L2: NOTES.filter((n) => n.layer === 'L2').length,
          legacy: NOTES.filter((n) => !n.layer).length
        },
        showPrivate,
        labelsCompact,
        profileVersion: DATA.profile?.version || null,
        selected,
        query,
        results: results.map((n) => n.id),
        version: DATA.version,
        range: NOTES.length ? [NOTES[0].date, NOTES[NOTES.length - 1].date] : [],
        paused,
        orbit,
        yaw,
        pitch,
        zoom,
        zoomTarget,
        generatedAt: DATA.generatedAt
      };
    }
  };
})();
