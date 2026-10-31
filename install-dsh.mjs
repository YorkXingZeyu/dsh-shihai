import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.join(here, 'plugins', 'dsh-shihai');
const profileDir = process.env.DSH_PROFILE_DIR || path.join(os.homedir(), '.dsh', 'profiles', 'desktop');
const manifestPath = path.join(profileDir, 'package.json');
const backupPath = path.join(profileDir, 'package.json.bak-before-shihai');
const linkPath = path.join(profileDir, 'node_modules', 'dsh-shihai');

if (!fs.existsSync(manifestPath)) {
  console.error(`没有找到 DSH profile：${manifestPath}`);
  console.error('请先安装并启动 DeepSeek Harness，或设置 DSH_PROFILE_DIR。');
  process.exit(1);
}
const original = fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
const manifest = JSON.parse(original);
if (!manifest.dsh?.profile?.bundles) {
  console.error('profile 缺少 dsh.profile.bundles；当前 DSH 版本可能不支持 bundle。');
  process.exit(1);
}
if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, original, 'utf8');
manifest.dependencies ||= {};
manifest.dependencies['dsh-shihai'] = 'link:' + pluginDir.replace(/\\/g, '/');
if (!manifest.dsh.profile.bundles.includes('dsh-shihai')) manifest.dsh.profile.bundles.push('dsh-shihai');
fs.mkdirSync(path.dirname(linkPath), { recursive: true });
try { fs.rmSync(linkPath, { recursive: true, force: true }); } catch {}
try {
  fs.symlinkSync(pluginDir, linkPath, 'junction');
} catch {
  fs.cpSync(pluginDir, linkPath, { recursive: true });
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ installed: 'dsh-shihai', profileDir, pluginDir, next: '重启 DSH；识海按钮会出现在输入区右侧。' }, null, 2));
