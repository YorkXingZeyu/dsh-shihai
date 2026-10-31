import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, '..');
const server = path.join(base, '识海视图', 'server.mjs');
const child = spawn(process.execPath, [server], {
  cwd: base,
  detached: true,
  stdio: 'ignore',
  windowsHide: true
});
child.on('error', () => {});
child.unref();
