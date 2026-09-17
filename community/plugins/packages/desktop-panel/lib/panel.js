/**
 * 自包含的桌面面板页面：canvas 渲染 JPEG 帧，采集鼠标/键盘/滚轮并回传。
 * 以单个 HTML 字符串返回，无需前端构建链，手机浏览器直接打开即可用。
 * @param {string} token 由 host 侧生成并注入页面的访问令牌
 * @returns {string} 面板页面 HTML
 */
export function renderPanel(token) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>DSH 桌面面板</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #14161a; color: #e6e8eb; font: 14px/1.5 "Microsoft YaHei", system-ui, sans-serif; overflow: hidden; }
  #bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #1c1f24; border-bottom: 1px solid #2b2f36; }
  #bar .spacer { flex: 1; }
  #bar button { background: #262a31; color: #e6e8eb; border: 1px solid #343a43; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 13px; }
  #bar button:hover { background: #30353d; }
  #bar button.on { background: #2d5bd7; border-color: #2d5bd7; }
  #status { font-size: 12px; color: #9aa3ad; }
  #stage { position: relative; width: 100vw; height: calc(100vh - 41px); overflow: hidden; background: #000; }
  #screen { display: block; width: 100%; height: 100%; object-fit: contain; image-rendering: auto; }
  #hint { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); color: #9aa3ad; text-align: center; pointer-events: none; }
</style>
</head>
<body>
<div id="bar">
  <strong>桌面面板</strong>
  <span id="status">正在连接…</span>
  <span class="spacer"></span>
  <button id="btn-fit" class="on">适应窗口</button>
  <button id="btn-1x">1:1</button>
  <button id="btn-cad">Ctrl+Alt+Del</button>
  <button id="btn-full">全屏</button>
</div>
<div id="stage">
  <canvas id="screen"></canvas>
  <div id="hint">等待画面…</div>
</div>
<script>
(function () {
  var canvas = document.getElementById('screen');
  var ctx = canvas.getContext('2d');
  var stage = document.getElementById('stage');
  var statusEl = document.getElementById('status');
  var hint = document.getElementById('hint');
  var fit = true;
  var ws = null;
  var screenW = 1920, screenH = 1080;
  canvas.width = screenW;
  canvas.height = screenH;
  var frameCount = 0, lastFpsAt = Date.now();

  function setStatus(text) { statusEl.textContent = text; }

  function layout() {
    if (fit) {
      var rect = stage.getBoundingClientRect();
      var scale = Math.min(rect.width / screenW, rect.height / screenH);
      canvas.style.width = Math.floor(screenW * scale) + 'px';
      canvas.style.height = Math.floor(screenH * scale) + 'px';
    } else {
      canvas.style.width = screenW + 'px';
      canvas.style.height = screenH + 'px';
    }
    canvas.style.position = 'absolute';
    canvas.style.left = '50%';
    canvas.style.top = '50%';
    canvas.style.transform = 'translate(-50%, -50%)';
  }

  function drawFrame(blob) {
    createImageBitmap(blob).then(function (bmp) {
      if (bmp.width !== screenW || bmp.height !== screenH) {
        screenW = bmp.width; screenH = bmp.height;
        canvas.width = screenW; canvas.height = screenH;
        layout();
      }
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      hint.style.display = 'none';
      frameCount++;
      var now = Date.now();
      if (now - lastFpsAt >= 1000) {
        setStatus('已连接 · ' + screenW + 'x' + screenH + ' · ' + frameCount + ' fps');
        frameCount = 0; lastFpsAt = now;
      }
    }).catch(function () { /* 单帧解码失败忽略 */ });
  }

  function send(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  function toScreen(ev) {
    var rect = canvas.getBoundingClientRect();
    var x = (ev.clientX - rect.left) / rect.width * screenW;
    var y = (ev.clientY - rect.top) / rect.height * screenH;
    return { x: Math.max(0, Math.min(screenW - 1, Math.round(x))), y: Math.max(0, Math.min(screenH - 1, Math.round(y))) };
  }

  function connect() {
    var token = ${JSON.stringify(token)};
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/plugin/desktop/stream?token=' + encodeURIComponent(token));
    ws.binaryType = 'blob';
    ws.onopen = function () { setStatus('已连接，等待首帧…'); };
    ws.onclose = function () { setStatus('连接已断开，3 秒后重连…'); setTimeout(connect, 3000); };
    ws.onerror = function () { setStatus('连接错误'); };
    ws.onmessage = function (ev) {
      if (typeof ev.data === 'string') return;
      var blob = ev.data;
      if (blob.size > 8) drawFrame(blob.slice(8));
    };
  }

  // 输入采集
  var dragging = false, lastMove = 0;
  canvas.addEventListener('mousemove', function (ev) {
    var now = Date.now();
    if (now - lastMove < 33) return;   // 30fps 节流
    lastMove = now;
    var p = toScreen(ev);
    send({ t: 'move', x: p.x, y: p.y });
  }, { passive: true });
  canvas.addEventListener('mousedown', function (ev) {
    var p = toScreen(ev);
    send({ t: 'down', button: ev.button === 2 ? 'right' : (ev.button === 1 ? 'middle' : 'left'), x: p.x, y: p.y });
    dragging = true;
  });
  canvas.addEventListener('mouseup', function (ev) {
    var p = toScreen(ev);
    send({ t: 'up', button: ev.button === 2 ? 'right' : (ev.button === 1 ? 'middle' : 'left'), x: p.x, y: p.y });
    dragging = false;
  });
  canvas.addEventListener('dblclick', function (ev) { var p = toScreen(ev); send({ t: 'dblclick', x: p.x, y: p.y }); });
  canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  canvas.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    send({ t: 'scroll', delta: ev.deltaY > 0 ? -120 : 120 });
  }, { passive: false });
  window.addEventListener('keydown', function (ev) {
    if (ev.ctrlKey && ev.altKey && (ev.key === 'Delete' || ev.key === 'Backspace')) { send({ t: 'cad' }); ev.preventDefault(); return; }
    send({ t: 'key', vk: ev.keyCode, up: 0 });
    if (ev.key.length === 1) ev.preventDefault();
  });
  window.addEventListener('keyup', function (ev) { send({ t: 'key', vk: ev.keyCode, up: 1 }); });

  // 触摸：单指移动=移动指针，轻点=左键，长按=右键，双指=滚动
  var touchStart = 0, longPressTimer = null, lastTouchY = 0;
  canvas.addEventListener('touchstart', function (ev) {
    if (ev.touches.length === 1) {
      touchStart = Date.now();
      var p = toScreen(ev.touches[0]);
      send({ t: 'move', x: p.x, y: p.y });
      longPressTimer = setTimeout(function () { send({ t: 'click', x: p.x, y: p.y, button: 'right' }); longPressTimer = null; }, 600);
    } else if (ev.touches.length === 2) { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } lastTouchY = ev.touches[0].clientY; }
    ev.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', function (ev) {
    if (ev.touches.length === 1) {
      var p = toScreen(ev.touches[0]);
      send({ t: 'move', x: p.x, y: p.y });
    } else if (ev.touches.length === 2) {
      var dy = ev.touches[0].clientY - lastTouchY;
      if (Math.abs(dy) > 12) { send({ t: 'scroll', delta: dy > 0 ? -120 : 120 }); lastTouchY = ev.touches[0].clientY; }
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }
    ev.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', function (ev) {
    if (longPressTimer) {
      clearTimeout(longPressTimer); longPressTimer = null;
      var dt = Date.now() - touchStart;
      if (dt < 250) {
        var p = toScreen(ev.changedTouches[0]);
        send({ t: 'click', x: p.x, y: p.y, button: 'left' });
      }
    }
    ev.preventDefault();
  }, { passive: false });

  document.getElementById('btn-fit').onclick = function () { fit = true; this.classList.add('on'); document.getElementById('btn-1x').classList.remove('on'); layout(); };
  document.getElementById('btn-1x').onclick = function () { fit = false; this.classList.add('on'); document.getElementById('btn-fit').classList.remove('on'); layout(); };
  document.getElementById('btn-full').onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); };
  document.getElementById('btn-cad').onclick = function () { send({ t: 'cad' }); };
  window.addEventListener('resize', layout);

  layout();
  connect();
})();
</script>
</body>
</html>`
}
