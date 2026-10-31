import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const viewRoot = path.dirname(here);
const vault = path.resolve(viewRoot, '..');
const buildScript = path.join(viewRoot, 'build.mjs');
const watchDirs = [
  path.join(vault, '20_共同经历'),
  path.join(vault, '30_片段'),
  path.join(vault, '35_原子'),
  path.join(vault, '40_项目'),
  path.join(vault, '90_元数据')
];

let timer = null;
let running = false;
let queued = false;

function build() {
  if (running) { queued = true; return; }
  running = true;
  const child = spawn(process.execPath, [buildScript], { cwd: viewRoot, stdio: 'inherit' });
  child.on('exit', (code) => {
    running = false;
    if (queued) { queued = false; build(); }
    else if (code === 0) console.log('[watch] 星图快照已更新，刷新页面即可看到。');
    else console.log('[watch] 构建失败，退出码 ' + code);
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(build, 450);
}

console.log('正在监听记忆库：');
for (const dir of watchDirs) {
  if (!fs.existsSync(dir)) { console.log('  跳过（不存在）：' + dir); continue; }
  console.log('  ' + dir);
  try {
    fs.watch(dir, { recursive: true }, schedule);
  } catch (err) {
    console.log('  监视失败：' + err.message);
  }
}
fs.watchFile(path.join(vault, '90_元数据', 'notes.index.json'), { interval: 600 }, schedule);
console.log('Markdown 或索引一变，就自动重建 index.html。Ctrl+C 停止。');
build();
