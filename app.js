/* 叠子象棋 界面层 */
(function () {
  'use strict';

  var XQ = window.XQ, AI = window.XQAI;
  var CELL = 68, MARGIN = 46, PS = 58;
  var BW = MARGIN * 2 + 8 * CELL;
  var BH = MARGIN * 2 + 9 * CELL;
  var NS = 'http://www.w3.org/2000/svg';

  var $ = function (s) { return document.querySelector(s); };

  var boardCol = $('#boardCol'), boardBox = $('#boardBox'), boardWrap = $('#boardWrap');
  var svg = $('#boardSvg'), hlLayer = $('#hlLayer'), pieceLayer = $('#pieceLayer');
  var tgtLayer = $('#tgtLayer'), fxLayer = $('#fxLayer');

  var game = null;
  var selected = null;
  var mode = 'stack';
  var aiColor = 'b';
  var diff = 'normal';
  var thinking = false;
  var flipped = false;
  var fxOn = true;
  var hiddenIdx = -1;      // 走子轨迹播放期间，落点暂时隐藏
  var targetMap = null;
  var aiToken = 0;

  var DIFF = {
    easy: { depth: 2, time: 400, noise: 0.9, minDelay: 900 },
    normal: { depth: 3, time: 900, minDelay: 1250 },
    hard: { depth: 4, time: 2200, minDelay: 1800 }
  };
  var AI_START_DELAY = 320;   // 人走完到 AI 开始思考之间的停顿

  /* ---------------- 画棋盘 ---------------- */

  function svgEl(name, attrs) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function buildBoard() {
    svg.setAttribute('viewBox', '0 0 ' + BW + ' ' + BH);
    svg.setAttribute('width', BW);
    svg.setAttribute('height', BH);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var g = svgEl('g', {
      stroke: '#7a5326', 'stroke-width': 1.5, 'stroke-linecap': 'round', fill: 'none'
    });

    var r, c, x, y;
    for (r = 0; r < 10; r++) {
      y = MARGIN + r * CELL;
      g.appendChild(svgEl('line', { x1: MARGIN, y1: y, x2: MARGIN + 8 * CELL, y2: y }));
    }
    for (c = 0; c < 9; c++) {
      x = MARGIN + c * CELL;
      if (c === 0 || c === 8) {
        g.appendChild(svgEl('line', { x1: x, y1: MARGIN, x2: x, y2: MARGIN + 9 * CELL }));
      } else {
        g.appendChild(svgEl('line', { x1: x, y1: MARGIN, x2: x, y2: MARGIN + 4 * CELL }));
        g.appendChild(svgEl('line', { x1: x, y1: MARGIN + 5 * CELL, x2: x, y2: MARGIN + 9 * CELL }));
      }
    }
    function diag(r1, c1, r2, c2) {
      g.appendChild(svgEl('line', {
        x1: MARGIN + c1 * CELL, y1: MARGIN + r1 * CELL,
        x2: MARGIN + c2 * CELL, y2: MARGIN + r2 * CELL
      }));
    }
    diag(0, 3, 2, 5); diag(0, 5, 2, 3);
    diag(7, 3, 9, 5); diag(7, 5, 9, 3);

    g.appendChild(svgEl('rect', {
      x: MARGIN, y: MARGIN, width: 8 * CELL, height: 9 * CELL,
      'stroke-width': 3, rx: 3
    }));
    svg.appendChild(g);

    var midY = MARGIN + 4.5 * CELL;
    var t1 = svgEl('text', {
      x: MARGIN + 2 * CELL, y: midY, 'text-anchor': 'middle',
      'dominant-baseline': 'central', fill: '#8a5f34', 'font-size': 25,
      'font-family': '"KaiTi","STKaiti",serif', 'letter-spacing': 12, opacity: 0.72
    });
    t1.textContent = '楚 河';
    svg.appendChild(t1);
    var t2 = svgEl('text', {
      x: MARGIN + 6 * CELL, y: midY, 'text-anchor': 'middle',
      'dominant-baseline': 'central', fill: '#8a5f34', 'font-size': 25,
      'font-family': '"KaiTi","STKaiti",serif', 'letter-spacing': 12, opacity: 0.72
    });
    t2.textContent = '汉 界';
    svg.appendChild(t2);
  }

  /* ---------------- 坐标换算 ---------------- */

  function dispPos(r, c) {
    return flipped ? [9 - r, 8 - c] : [r, c];
  }
  function boardPos(r, c) {
    return flipped ? [9 - r, 8 - c] : [r, c];
  }

  /* ---------------- 渲染 ---------------- */

  function computeTargets() {
    targetMap = null;
    if (!game || selected == null || game.result) return;
    var map = new Map();
    var ms = XQ.legalMoves(game);
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m.from !== selected || m.to === undefined) continue;
      if (!map.has(m.to)) map.set(m.to, []);
      map.get(m.to).push(m);
    }
    targetMap = map;
  }

  function addHl(idx, cls) {
    var p = XQ.rc(idx), d = dispPos(p[0], p[1]);
    var el = document.createElement('div');
    el.className = 'hl ' + cls;
    el.style.left = (MARGIN + d[1] * CELL) + 'px';
    el.style.top = (MARGIN + d[0] * CELL) + 'px';
    hlLayer.appendChild(el);
  }

  function addTg(idx, cls) {
    var p = XQ.rc(idx), d = dispPos(p[0], p[1]);
    var el = document.createElement('div');
    el.className = 'tg ' + cls;
    el.style.left = (MARGIN + d[1] * CELL) + 'px';
    el.style.top = (MARGIN + d[0] * CELL) + 'px';
    tgtLayer.appendChild(el);
  }

  function renderHighlights() {
    hlLayer.innerHTML = '';
    tgtLayer.innerHTML = '';
    if (!game) return;
    var lm = game.lastMove;
    if (lm) {
      addHl(lm.from, 'last-from');
      if (lm.to !== undefined) addHl(lm.to, 'last-to');
    }
    if (selected != null) addHl(selected, 'sel');
    if (targetMap) {
      targetMap.forEach(function (list, to) {
        var cls = 'dot';
        var canCap = false, canLoad = false;
        for (var i = 0; i < list.length; i++) {
          if (list[i].capture) canCap = true;
          if (list[i].kind === 'load') canLoad = true;
        }
        if (canCap) cls = 'cap';
        else if (canLoad) cls = 'load';
        addTg(to, cls);
      });
    }
  }

  function renderPieces() {
    pieceLayer.innerHTML = '';
    if (!game) return;
    var checkColor = null;
    if (!game.result && XQ.isKingAttacked(game.board, game.turn, game.cfg)) checkColor = game.turn;

    for (var i = 0; i < 90; i++) {
      var cell = game.board[i];
      if (!cell) continue;
      var p = XQ.rc(i), d = dispPos(p[0], p[1]);
      var top = XQ.topOf(cell);
      var col = XQ.colorOf(top);

      var el = document.createElement('div');
      var cls = 'piece ' + (col === 'r' ? 'red' : 'black');
      if (cell.length > 1) cls += ' stacked';
      if (checkColor === col && top.toUpperCase() === 'K') cls += ' in-check';
      el.className = cls;
      el.style.left = (MARGIN + d[1] * CELL - PS / 2) + 'px';
      el.style.top = (MARGIN + d[0] * CELL - PS / 2) + 'px';

      var ch = document.createElement('span');
      ch.textContent = XQ.pieceName(top);
      el.appendChild(ch);
      if (i === hiddenIdx) el.style.opacity = '0';

      if (cell.length > 1) {
        var chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = cell.slice(0, -1).map(function (x) { return XQ.pieceName(x); }).join('');
        el.appendChild(chip);
      }
      pieceLayer.appendChild(el);
    }
  }

  function renderStatus() {
    var st = $('#status'), sub = $('#substatus');
    st.className = 'status';
    if (!game) return;
    if (game.result) {
      if (game.result.type === 'draw') {
        st.textContent = '和棋';
        st.classList.add('win');
      } else {
        st.textContent = (game.result.winner === 'r' ? '红方' : '黑方') + '胜';
        st.classList.add('win');
      }
      sub.textContent = game.result.reason || '';
      return;
    }
    var isRed = game.turn === 'r';
    st.textContent = (isRed ? '红方走棋' : '黑方走棋') + (thinking ? ' · AI 思考中…' : '');
    st.classList.add(isRed ? 'red' : 'black');
    var chk = XQ.isKingAttacked(game.board, game.turn, game.cfg);
    sub.textContent = chk ? '被将军，必须应将' : '';
  }

  function renderSelection() {
    var txt = $('#selText'), modeRow = $('#modeRow'), sw = $('#switchBtn');
    if (!game) return;
    if (selected == null || !game.board[selected]) {
      txt.textContent = game.result ? '对局结束' : (aiColor && game.turn === aiColor ? 'AI 思考中…' : '点选自己的棋子开始');
      modeRow.hidden = true;
      sw.hidden = true;
      return;
    }
    var cell = game.board[selected];
    var names = cell.slice().reverse().map(function (ch) { return XQ.pieceName(ch); });
    txt.innerHTML = names.map(function (n, i) {
      return i === 0 ? '<b>' + n + '</b>' : n;
    }).join(' <span style="color:#6f7784">/</span> ') +
      (cell.length > 1 ? '　<span style="color:#8b93a1;font-size:12px">上／下</span>' : '');

    modeRow.hidden = cell.length <= 1;
    var btns = modeRow.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-mode') === mode);
    }
    sw.hidden = !(cell.length > 1 && game.cfg.switchCostsMove && !game.result);
  }

  function renderMoves() {
    var box = $('#movelist');
    if (!game) return;
    var h = game.history, html = '';
    for (var i = 0; i < h.length; i += 2) {
      var n = i / 2 + 1;
      var a = h[i] ? escapeHtml(h[i].notation) : '';
      var b = h[i + 1] ? escapeHtml(h[i + 1].notation) : '';
      html += '<div class="mvrow"><span class="mvno">' + n + '</span>' +
        '<span class="mvr">' + a + '</span><span class="mvb">' + b + '</span></div>';
    }
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------- 战斗特效 ---------------- */

  function fxPos(idx) {
    var p = XQ.rc(idx), d = dispPos(p[0], p[1]);
    return { x: MARGIN + d[1] * CELL, y: MARGIN + d[0] * CELL };
  }

  function fxEl(cls, x, y, size, vars, dur) {
    var d = document.createElement('div');
    d.className = 'fx ' + cls;
    d.style.left = (x - size / 2) + 'px';
    d.style.top = (y - size / 2) + 'px';
    d.style.width = size + 'px';
    d.style.height = size + 'px';
    if (vars) for (var k in vars) d.style.setProperty(k, vars[k]);
    fxLayer.appendChild(d);
    setTimeout(function () {
      if (d.parentNode) d.parentNode.removeChild(d);
    }, dur || 700);
    return d;
  }

  function fxRing(x, y, color, from, to, dur) {
    fxEl('fx-ring', x, y, 58, { '--c': color, '--from': from, '--to': to }, dur || 640);
  }

  function fxSparks(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
      var dist = 34 + Math.random() * 26;
      fxEl('fx-spark', x, y, 8, {
        '--c': color,
        '--tx': (Math.cos(a) * dist).toFixed(1) + 'px',
        '--ty': (Math.sin(a) * dist).toFixed(1) + 'px'
      }, 640);
    }
  }

  function fxGhost(x, y, ch) {
    var d = fxEl('fx-ghost', x, y, 58, null, 660);
    d.textContent = XQ.pieceName(ch);
    d.classList.add(XQ.colorOf(ch) === 'r' ? 'red' : 'black');
  }

  function fxCheck(x, y) {
    fxRing(x, y, '#ff4d4d', 0.7, 2.3, 720);
    setTimeout(function () { fxRing(x, y, '#ff4d4d', 0.8, 2.6, 720); }, 130);
    // “将”字贴边时改放到将的下方，避免被棋盘裁掉或压住棋子
    var ty = y < 130 ? y + 46 : y - 26;
    ty = Math.min(Math.max(ty, 56), BH - 56);
    var t = fxEl('fx-text', x, ty, 80, null, 860);
    t.textContent = '将';
    var v = document.createElement('div');
    v.className = 'fx fx-vignette';
    fxLayer.appendChild(v);
    setTimeout(function () { if (v.parentNode) v.parentNode.removeChild(v); }, 860);
  }

  function fxShake() {
    pieceLayer.classList.add('fx-shake');
    setTimeout(function () { pieceLayer.classList.remove('fx-shake'); }, 280);
  }

  function fxSlide(mv) {
    if (!fxOn || !mv || mv.to === undefined || mv.kind === 'switch') return;
    var h = game.history[game.history.length - 1];
    if (!h || !h.board[mv.from]) return;
    var src = h.board[mv.from];
    var ch = src[src.length - 1];
    var from = fxPos(mv.from), to = fxPos(mv.to);

    var d = document.createElement('div');
    d.className = 'fx fx-move ' + (XQ.colorOf(ch) === 'r' ? 'red' : 'black');
    d.textContent = XQ.pieceName(ch);
    d.style.left = (from.x - 29) + 'px';
    d.style.top = (from.y - 29) + 'px';
    d.style.width = '58px';
    d.style.height = '58px';
    d.style.setProperty('--dx', (to.x - from.x) + 'px');
    d.style.setProperty('--dy', (to.y - from.y) + 'px');
    fxLayer.appendChild(d);
    setTimeout(function () {
      if (d.parentNode) d.parentNode.removeChild(d);
    }, 330);
  }

  function spawnEffects(mv) {
    if (!fxOn || !mv) return;
    var from = fxPos(mv.from);
    var to = mv.to !== undefined ? fxPos(mv.to) : null;

    // 吃子：橙红环炸开 + 火星 + 被吃子残影 + 震屏
    if (mv.capture && to) {
      fxRing(to.x, to.y, '#ff6b2c', 0.85, 2.2);
      fxSparks(to.x, to.y, '#ff7a1a', 9);
      var h = game.history[game.history.length - 1];
      if (h && h.captured && h.captured.length) {
        fxGhost(to.x, to.y, h.captured[h.captured.length - 1]);
      }
      fxShake();
    }

    // 合体：两个光点向中心汇聚 + 光晕
    if (mv.kind === 'load' && to) {
      fxEl('fx-merge', to.x, to.y, 12, { '--c': '#12a37a', '--sx': '-20px', '--sy': '-11px' }, 560);
      fxEl('fx-merge', to.x, to.y, 12, { '--c': '#12a37a', '--sx': '20px', '--sy': '11px' }, 560);
      fxRing(to.x, to.y, '#12a37a', 1.8, 0.35, 620);
    }

    // 拆分：落点绽开 + 原格亮一下（露出底子）
    if (mv.kind === 'top' && to) {
      fxRing(to.x, to.y, '#ff6b2c', 0.85, 1.7);
      fxRing(from.x, from.y, '#2f7fff', 1.5, 0.3);
    }

    // 换顶
    if (mv.kind === 'switch') {
      fxRing(from.x, from.y, '#8b5cf6', 0.85, 1.8);
    }

    // 将军：红环 + “将”字 + 边框红光
    if (XQ.isKingAttacked(game.board, game.turn, game.cfg)) {
      var k = XQ.findKing(game.board, game.turn);
      if (k >= 0) {
        var kp = fxPos(k);
        fxCheck(kp.x, kp.y);
      }
    }
  }

  /* ---------------- 落子 ---------------- */

  function afterPlay(mv) {
    var slide = !!(fxOn && mv && mv.to !== undefined && mv.kind !== 'switch');
    hiddenIdx = slide ? mv.to : -1;
    render();
    if (slide) {
      fxSlide(mv);
      setTimeout(function () {
        if (hiddenIdx === mv.to) hiddenIdx = -1;
        if (game) render();
      }, 300);
    }
    spawnEffects(mv);
  }

  function commitMove(mv) {
    if (!game || !XQ.play(game, mv)) return;
    selected = null;
    afterPlay(mv);
    maybeAI();
  }

  function render() {
    if (!game) return;
    computeTargets();
    renderHighlights();
    renderPieces();
    renderStatus();
    renderSelection();
    renderMoves();
  }

  /* ---------------- 自适应缩放 ---------------- */

  var raf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : function (fn) { return setTimeout(fn, 16); };
  var fitPending = false;

  function fit() {
    var vw = window.innerWidth || BW;
    var vh = window.innerHeight || BH;
    var phone = vw <= 560;
    var narrow = vw <= 1060;
    var padX = phone ? 16 : (narrow ? 24 : 0);
    var padY = phone ? 150 : (narrow ? 110 : 60);
    var availW = Math.max(240, vw - padX);
    var availH = Math.max(240, vh - padY);
    var s = Math.min(1, availW / BW, availH / BH);
    if (!isFinite(s) || s <= 0) s = 1;
    boardBox.style.width = (BW * s) + 'px';
    boardBox.style.height = (BH * s) + 'px';
    boardWrap.style.transform = 'scale(' + s + ')';
  }

  function requestFit() {
    if (fitPending) return;
    fitPending = true;
    raf(function () { fitPending = false; fit(); });
  }

  /* ---------------- 交互 ---------------- */

  function cellAt(evt) {
    var rect = boardWrap.getBoundingClientRect();
    var scale = rect.width / BW;
    if (!scale) return -1;
    var x = (evt.clientX - rect.left) / scale;
    var y = (evt.clientY - rect.top) / scale;
    var dc = Math.round((x - MARGIN) / CELL);
    var dr = Math.round((y - MARGIN) / CELL);
    if (dc < 0 || dc > 8 || dr < 0 || dr > 9) return -1;
    var cx = MARGIN + dc * CELL, cy = MARGIN + dr * CELL;
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > (CELL * 0.62) * (CELL * 0.62)) return -1;
    var bp = boardPos(dr, dc);
    return XQ.idx(bp[0], bp[1]);
  }

  function onClick(evt) {
    if (!game || game.result || thinking) return;
    if (aiColor && game.turn === aiColor) return;
    var i = cellAt(evt);
    if (i < 0) { selected = null; render(); return; }

    if (targetMap && targetMap.has(i)) {
      var list = targetMap.get(i), mv = null;
      for (var k = 0; k < list.length; k++) if (list[k].kind === mode) { mv = list[k]; break; }
      if (!mv) mv = list[0];
      commitMove(mv);
      return;
    }

    var cell = game.board[i];
    if (cell && XQ.colorOf(XQ.topOf(cell)) === game.turn) {
      if (selected === i) { selected = null; render(); return; }   // 再点一次取消
      selected = i;
      mode = 'stack';
      render();
      return;
    }
    selected = null;
    render();
  }

  function doSwitch() {
    if (selected == null || thinking || game.result) return;
    var ms = XQ.legalMoves(game).filter(function (m) {
      return m.from === selected && m.kind === 'switch';
    });
    if (!ms.length) return;
    commitMove(ms[0]);
  }

  function undoMove() {
    if (!game || thinking) return;
    XQ.undo(game);
    if (aiColor && game.turn === aiColor && game.history.length) XQ.undo(game);
    selected = null;
    hiddenIdx = -1;
    render();
  }

  function maybeAI() {
    if (!game || game.result || !aiColor || game.turn !== aiColor) return;
    var token = ++aiToken;
    thinking = true;
    render();
    setTimeout(function () {
      if (token !== aiToken || !game || game.result) return;

      var d = DIFF[diff] || DIFF.normal;
      var t0 = Date.now();
      var mv = AI.chooseMove(game, { depth: d.depth, timeMs: d.time, noise: d.noise || 0 });
      var spent = Date.now() - t0;
      // 出招节奏：保证至少停留 minDelay，快棋也不会一闪而过
      var wait = Math.max(0, (d.minDelay || 900) - spent);

      setTimeout(function () {
        if (token !== aiToken || !game) return;
        thinking = false;
        selected = null;
        if (game.result || !mv) { render(); return; }
        XQ.play(game, mv);
        afterPlay(mv);
      }, wait);
    }, AI_START_DELAY);
  }

  function newGame() {
    aiToken++;
    thinking = false;
    aiColor = $('#modeSel').value === 'pvp' ? null
      : ($('#modeSel').value === 'pve-b' ? 'b' : 'r');
    diff = $('#diffSel').value;
    flipped = aiColor === 'r';
    var cap = parseInt($('#capSel').value, 10) || 2;
    var aeMode = $('#aeSel').value === 'zone' ? 'zone' : 'free';
    fxOn = $('#fxSel').value !== 'off';
    if (fxLayer) fxLayer.innerHTML = '';
    game = XQ.createGame({ maxStack: cap, switchCostsMove: true, aeMode: aeMode });
    window.__game = game;   // 便于调试/自测
    selected = null;
    hiddenIdx = -1;
    render();
    maybeAI();
  }

  /* ---------------- 绑定 ---------------- */

  boardWrap.addEventListener('click', onClick);

  $('#undoBtn').addEventListener('click', undoMove);
  $('#newBtn').addEventListener('click', newGame);
  $('#switchBtn').addEventListener('click', doSwitch);
  $('#fxSel').addEventListener('change', function () { fxOn = this.value !== 'off'; });

  var modeBtns = document.querySelectorAll('#modeRow button');
  for (var i = 0; i < modeBtns.length; i++) {
    modeBtns[i].addEventListener('click', function () {
      mode = this.getAttribute('data-mode');
      render();
    });
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoMove();
    }
  });

  window.addEventListener('resize', requestFit);
  window.addEventListener('orientationchange', function () {
    requestFit();
    setTimeout(fit, 180);
    setTimeout(fit, 420);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', requestFit);
    window.visualViewport.addEventListener('scroll', requestFit);
  }
  // 窗口尺寸可能在脚本初始化之后才变化（手机旋屏、地址栏收起、某些内嵌浏览器）
  if (window.ResizeObserver) {
    new window.ResizeObserver(requestFit).observe(document.documentElement);
  }
  window.addEventListener('load', requestFit);

  buildBoard();
  newGame();
  fit();
  requestFit();
  setTimeout(fit, 60);
  setTimeout(fit, 300);

  // 手机上把“对局设置”默认收起来，省得挡路
  var sc = $('#settingsCard');
  if (sc && window.innerWidth <= 560) sc.open = false;
})();
