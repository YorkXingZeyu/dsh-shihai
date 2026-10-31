/**
 * dsh-shihai · 在 DSH Web / Desktop 内一键打开「识海」
 *
 * 只做两件事：
 * 1) 注入一个不依赖 DSH 内部组件树的浮动按钮；
 * 2) 点击后在 DSH 页面内打开全屏 iframe，指向本机识海。
 *
 * 不读写会话、不改 DSH 状态。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const name = 'dsh-shihai';
export const inject = [];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_VIEWER = 'http://127.0.0.1:4177/';
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');
const PANEL_FILE = path.join(HERE, 'panel.js');

let viewerStarted = false;
let configState = { viewerUrl: DEFAULT_VIEWER, memoryRoot: DEFAULT_ROOT };

function readPanel(viewerUrl) {
  return fs.readFileSync(PANEL_FILE, 'utf8').replaceAll('__VIEWER_URL__', JSON.stringify(String(viewerUrl || DEFAULT_VIEWER)));
}

function ensureViewer(root) {
  if (viewerStarted) return;
  viewerStarted = true;
  try {
    const starter = path.join(root, 'tools', 'start-viewer.mjs');
    if (!fs.existsSync(starter)) return;
    const child = spawn(process.execPath, [starter], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
  } catch { /* 已有服务或启动失败时，iframe 会自行显示连接失败 */ }
}

function inlineDesktopInjector() {
  return "(function(){try{var d=document.body||document.documentElement;if(!d)return;" +
    "if(document.getElementById('dsh-shihai-panel-script'))return;" +
    "var s=document.createElement('script');s.id='dsh-shihai-panel-script';" +
    "s.src='/dsh-shihai/panel.js';s.onerror=function(){};d.appendChild(s)}catch(e){}})()";
}

export function apply(ctx, config = {}) {
  configState = {
    viewerUrl: String(config.viewerUrl || DEFAULT_VIEWER),
    memoryRoot: path.resolve(String(config.memoryRoot || DEFAULT_ROOT))
  };
  ensureViewer(configState.memoryRoot);

  const disposers = [];
  // 桌面端注入表在宿主启动时收集，必须先于 webServer 就绪注册。
  const off = ctx.on('webserver/index-inject', (table) => {
    try {
      if (!Array.isArray(table)) return;
      if (table.some((r) => r && r.kind === 'script' && String(r.text || '').includes('/dsh-shihai/panel.js'))) return;
      table.push({ kind: 'script', text: inlineDesktopInjector() });
    } catch { /* Web 形态仍可用 */ }
  });
  if (typeof off === 'function') disposers.push(off);

  ctx.inject(['webServer'], (webCtx) => {
    const register = (route) => {
      const d = webCtx.webServer.register(route);
      if (typeof d === 'function') disposers.push(d);
      return d;
    };
    register({
      kind: 'exact',
      path: '/dsh-shihai/panel.js',
      handler: (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(readPanel(configState.viewerUrl));
      }
    });
    register({
      kind: 'exact',
      path: '/dsh-shihai/health',
      handler: (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, viewerUrl: configState.viewerUrl }));
      }
    });
    if (typeof webCtx.webServer.tapIndex === 'function') {
      const tap = webCtx.webServer.tapIndex((html) => {
        if (!html || html.indexOf('/dsh-shihai/panel.js') !== -1) return html;
        const tag = '<script defer src="/dsh-shihai/panel.js"></script>';
        return html.indexOf('</body>') !== -1 ? html.replace('</body>', tag + '</body>') : html + tag;
      });
      if (typeof tap === 'function') disposers.push(tap);
    }
  });

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => {
      for (const d of disposers) { try { d(); } catch {} }
    });
  }
  ctx.logger?.info?.(`识海入口已挂载：${configState.viewerUrl}`);
}
