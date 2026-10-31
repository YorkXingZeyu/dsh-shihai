/* dsh-shihai · 一个不依赖 DSH 组件树的浮动入口。 */
(function () {
  'use strict';
  if (window.__dshShihaiMounted) return;
  window.__dshShihaiMounted = true;
  const VIEWER_URL = __VIEWER_URL__;
  const BUTTON_ID = 'dsh-shihai-launcher';
  const OVERLAY_ID = 'dsh-shihai-overlay';

  const style = document.createElement('style');
  style.id = 'dsh-shihai-style';
  style.textContent = `
    #${BUTTON_ID}{position:fixed;left:168px;right:auto;bottom:86px;z-index:2147483000;display:flex;align-items:center;gap:8px;
      padding:9px 14px;border:1px solid rgba(126,149,255,.55);border-radius:999px;background:rgba(4,12,24,.88);
      color:#cbd7ff;font:600 12px/1 "Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif;letter-spacing:.04em;
      box-shadow:0 8px 28px rgba(0,0,0,.35),0 0 22px rgba(77,107,254,.16);cursor:pointer;backdrop-filter:blur(12px);
      transition:background .18s,border-color .18s,transform .18s,box-shadow .18s;user-select:none}
    #${BUTTON_ID}:hover{background:rgba(10,25,52,.96);border-color:#7e95ff;color:#fff;transform:translateY(-1px);
      box-shadow:0 10px 30px rgba(0,0,0,.42),0 0 26px rgba(77,107,254,.28)}
    #${BUTTON_ID} .fish{font-size:15px;line-height:1;filter:drop-shadow(0 0 5px rgba(126,149,255,.7))}
    #${BUTTON_ID} .dot{width:5px;height:5px;border-radius:50%;background:#4d6bfe;box-shadow:0 0 9px #4d6bfe}
    #${OVERLAY_ID}{position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;
      background:rgba(1,4,10,.82);backdrop-filter:blur(6px);padding:28px}
    #${OVERLAY_ID}.open{display:flex}
    .dsh-shihai-shell{width:min(1480px,96vw);height:min(900px,92vh);display:flex;flex-direction:column;
      border:1px solid rgba(126,149,255,.28);border-radius:14px;overflow:hidden;background:#030810;
      box-shadow:0 30px 100px rgba(0,0,0,.7),0 0 60px rgba(77,107,254,.12)}
    .dsh-shihai-head{display:flex;align-items:center;gap:10px;padding:9px 12px;background:#07101d;
      border-bottom:1px solid rgba(164,191,221,.14);color:#dce6ff;font:600 12px/1.2 "Microsoft YaHei UI",system-ui,sans-serif}
    .dsh-shihai-head .sub{font:9px/1 "Cascadia Mono",Consolas,monospace;color:#7d8ea8;letter-spacing:.08em}
    .dsh-shihai-head .grow{flex:1}
    .dsh-shihai-head a,.dsh-shihai-head button{appearance:none;border:1px solid rgba(164,191,221,.18);
      background:rgba(255,255,255,.03);color:#aebdd9;border-radius:7px;padding:6px 9px;font:10px/1 "Microsoft YaHei UI",sans-serif;cursor:pointer;text-decoration:none}
    .dsh-shihai-head a:hover,.dsh-shihai-head button:hover{color:#fff;border-color:rgba(126,149,255,.65);background:rgba(77,107,254,.12)}
    .dsh-shihai-frame{width:100%;height:100%;border:0;background:#030810;display:block}
    @media(max-width:700px){#${BUTTON_ID}{left:112px;right:auto;bottom:74px;padding:8px 11px;font-size:11px}
      #${OVERLAY_ID}{padding:0}.dsh-shihai-shell{width:100vw;height:100vh;border-radius:0;border:0}
      .dsh-shihai-head{padding:8px 10px}}
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.title = '打开识海（DSH 内嵌）';
  button.innerHTML = '<span class="fish">◈</span><span>识海</span><span class="dot"></span>';
  document.body.appendChild(button);

  let overlay = null;
  let iframe = null;
  let previousOverflow = '';

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = previousOverflow;
    if (iframe) { try { iframe.src = 'about:blank'; } catch {} }
  }

  function open() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.innerHTML = `
        <div class="dsh-shihai-shell">
          <div class="dsh-shihai-head">
            <span>◈ 识海</span>
            <span class="sub">REAL MEMORY · LIVE</span>
            <span class="grow"></span>
            <a href="${VIEWER_URL}" target="_blank" rel="noopener">在新窗口打开</a>
            <button type="button" data-close="1" aria-label="关闭识海">关闭 ×</button>
          </div>
          <iframe class="dsh-shihai-frame" title="识海" src="${VIEWER_URL}"
            allow="clipboard-read; clipboard-write; fullscreen"></iframe>
        </div>`;
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-close]')) close();
      });
      document.body.appendChild(overlay);
      iframe = overlay.querySelector('iframe');
    } else {
      if (iframe && (iframe.src === 'about:blank' || !iframe.src)) iframe.src = VIEWER_URL;
    }
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlay.classList.add('open');
    if (iframe) { try { iframe.focus(); } catch {} }
  }

  button.addEventListener('click', open);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) close();
  }, true);
})();
