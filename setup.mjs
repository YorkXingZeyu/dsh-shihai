import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dirs = [
  '.private', '20_共同经历', '30_片段', '30_约定', '35_原子',
  '40_项目', '50_故事', '50_日常', '60_主题', '80_原始会话',
  '90_元数据', 'config'
];
for (const d of dirs) fs.mkdirSync(path.join(root, d), { recursive: true });

const index = path.join(root, '90_元数据', 'notes.index.json');
if (!fs.existsSync(index)) {
  fs.writeFileSync(index, JSON.stringify({ generatedAt: new Date().toISOString(), notes: [] }, null, 2) + '\n');
}
const layout = path.join(root, '90_元数据', 'layout.json');
if (!fs.existsSync(layout)) {
  fs.writeFileSync(layout, JSON.stringify({
    generatedAt: new Date().toISOString(), method: 'none', vectorSource: 'none',
    embeddingModel: 'none', layoutMode: 'incremental', seed: 0,
    nodes: {}, stories: [], communities: {}, semanticEdges: [], newNodes: []
  }, null, 2) + '\n');
}
const sources = path.join(root, 'config', 'sources.json');
if (!fs.existsSync(sources)) {
  fs.copyFileSync(path.join(root, 'config', 'sources.example.json'), sources);
}
const result = spawnSync(process.execPath, [path.join(root, '识海视图', 'build.mjs')], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
console.log(`\n识海已初始化：${root}`);
console.log('下一步：node install-dsh.mjs 安装 DSH 入口，或 node tools/start-viewer.mjs 直接打开查看器。');
