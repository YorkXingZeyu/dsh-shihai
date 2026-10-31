import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildData } from './data.mjs';

const here = fileURLToPath(import.meta.url);
const viewRoot = path.dirname(here);
const vault = path.resolve(viewRoot, '..');
const data = buildData(vault);

const shell = fs.readFileSync(path.join(viewRoot, 'src', 'shell.html'), 'utf8');
const style = fs.readFileSync(path.join(viewRoot, 'src', 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(viewRoot, 'src', 'app.js'), 'utf8');
const json = JSON.stringify(data).replace(/<\//g, '<\\/');

for (const marker of ['<style>/*STYLE*/</style>', '<script>/*DATA*/</script>', '<script>/*APP*/</script>']) {
  if (!shell.includes(marker)) throw new Error('shell.html 缺少占位：' + marker);
}
if (/<\/script/i.test(style) || /<\/script/i.test(app)) throw new Error('源码含会提前结束的标签');
const html = shell
  .replace('<style>/*STYLE*/</style>', () => `<style>\n${style}\n</style>`)
  .replace('<script>/*DATA*/</script>', () => `<script>\nwindow.MEMORY_DATA = ${json};\n</script>`)
  .replace('<script>/*APP*/</script>', () => `<script>\n${app}\n</script>`);
if (/<script[^>]+src=/i.test(html)) throw new Error('含外部脚本');
if (/<link[^>]+stylesheet/i.test(html)) throw new Error('含外部样式');
fs.writeFileSync(path.join(viewRoot, 'index.html'), html, 'utf8');
fs.writeFileSync(path.join(viewRoot, '数据快照.json'), JSON.stringify(data, null, 2), 'utf8');
console.log(JSON.stringify({ built: path.join(viewRoot, 'index.html'), bytes: Buffer.byteLength(html, 'utf8'), notes: data.notes.length, version: data.version, generatedAt: data.generatedAt }, null, 2));
