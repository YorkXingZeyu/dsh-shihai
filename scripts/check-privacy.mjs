import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bad = [
  /[A-Za-z]:\\Users\\/i,
  /[A-Za-z]:\\[^"\n]*(?:\.dsh|qqbot)/i,
  /[A-Za-z]:\\[^"\n]*\\(?:sessions|raw)\\/i
];
const skip = new Set(['.git', 'node_modules', '.private']);
const hits = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.isFile() && !/\.(png|jpg|jpeg|webp|gif|zip|pdf)$/i.test(ent.name)) {
      const text = fs.readFileSync(p, 'utf8');
      const lines = text.split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const re of bad) if (re.test(line)) hits.push({ file: path.relative(root, p), line: i + 1, match: re.source });
      });
    }
  }
}
walk(root);
if (hits.length) {
  console.error(JSON.stringify(hits, null, 2));
  process.exit(1);
}
console.log('privacy check: no obvious private paths or known session IDs');
