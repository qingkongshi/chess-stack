/* 叠子象棋 规则引擎
 * 纯逻辑、零依赖，浏览器与 Node 共用（UMD）。
 *
 * 棋盘：board 长度 90 的数组，索引 i = row*9 + col。
 *   黑方在上（row 0-4），红方在下（row 5-9），河界在 row 4 / row 5 之间。
 *   单元格为 null 或“摞”：数组，第一个是底子，最后一个是顶子。
 *   例如 ['H','R'] 表示马在下、车在上。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XQ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLS = 9, ROWS = 10;

  var DIRS_ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var DIRS_DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var HORSE = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  var ELEPH = [[-2, -2], [-2, 2], [2, -2], [2, 2]];

  var NAMES = {
    r: { K: '帅', A: '仕', E: '相', H: '马', R: '车', C: '炮', P: '兵' },
    b: { K: '将', A: '士', E: '象', H: '马', R: '车', C: '炮', P: '卒' }
  };
  var CN = '一二三四五六七八九';

  var DEFAULT_CFG = {
    maxStack: 2,            // 一摞最多几子
    switchCostsMove: true,  // 原地换顶层算不算一步棋
    aeMode: 'free'          // 士象：'free' 揭棋式（全盘不受宫禁/河界） | 'zone' 区内受限、出区解禁
  };

  /* ---------------- 基础工具 ---------------- */

  function colorOf(ch) { return ch === ch.toUpperCase() ? 'r' : 'b'; }
  function other(c) { return c === 'r' ? 'b' : 'r'; }
  function idx(r, c) { return r * 9 + c; }
  function rc(i) { return [(i / 9) | 0, i % 9]; }
  function inBoard(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
  function topOf(cell) { return cell ? cell[cell.length - 1] : undefined; }
  function pieceName(ch) {
    if (!ch) return '';
    return NAMES[colorOf(ch)][ch.toUpperCase()] || '?';
  }
  function hasKing(cell) {
    if (!cell) return false;
    for (var i = 0; i < cell.length; i++) {
      if (cell[i].toUpperCase() === 'K') return true;
    }
    return false;
  }
  function cloneBoard(board) {
    var out = new Array(90);
    for (var i = 0; i < 90; i++) out[i] = board[i] ? board[i].slice() : null;
    return out;
  }
  function inPalace(color, r, c) {
    if (c < 3 || c > 5) return false;
    return color === 'r' ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2);
  }
  function ownSide(color, r) { return color === 'r' ? r >= 5 : r <= 4; }

  function initialState() {
    var b = new Array(90).fill(null);
    var back = ['r', 'h', 'e', 'a', 'k', 'a', 'e', 'h', 'r'];
    var redBack = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R'];
    for (var c = 0; c < 9; c++) {
      b[idx(0, c)] = [back[c]];
      b[idx(9, c)] = [redBack[c]];
    }
    b[idx(2, 1)] = ['c']; b[idx(2, 7)] = ['c'];
    b[idx(7, 1)] = ['C']; b[idx(7, 7)] = ['C'];
    [0, 2, 4, 6, 8].forEach(function (cc) {
      b[idx(3, cc)] = ['p'];
      b[idx(6, cc)] = ['P'];
    });
    return b;
  }

  function normalizeCfg(cfg) {
    var out = {};
    for (var k in DEFAULT_CFG) out[k] = DEFAULT_CFG[k];
    if (cfg) for (var j in cfg) if (cfg[j] !== undefined) out[j] = cfg[j];
    return out;
  }

  /* ---------------- 走法生成（单子） ---------------- */

  // 返回 [{to, hit:'empty'|'own'|'enemy'}]
  function collect(board, from, cfg) {
    var cell = board[from];
    if (!cell) return [];
    var ch = topOf(cell);
    var color = colorOf(ch);
    var type = ch.toUpperCase();
    var p = rc(from), r = p[0], c = p[1];
    var res = [];

    function add(rr, cc) {
      if (!inBoard(rr, cc)) return;
      var t = board[idx(rr, cc)];
      if (!t) { res.push({ to: idx(rr, cc), hit: 'empty' }); return; }
      res.push({ to: idx(rr, cc), hit: colorOf(topOf(t)) === color ? 'own' : 'enemy' });
    }

    if (type === 'R') {
      for (var d = 0; d < 4; d++) {
        var dr = DIRS_ORTH[d][0], dc = DIRS_ORTH[d][1];
        var rr = r + dr, cc = c + dc;
        while (inBoard(rr, cc)) {
          var t = board[idx(rr, cc)];
          if (!t) { res.push({ to: idx(rr, cc), hit: 'empty' }); rr += dr; cc += dc; continue; }
          res.push({ to: idx(rr, cc), hit: colorOf(topOf(t)) === color ? 'own' : 'enemy' });
          break;
        }
      }
    } else if (type === 'C') {
      for (var d2 = 0; d2 < 4; d2++) {
        var dr2 = DIRS_ORTH[d2][0], dc2 = DIRS_ORTH[d2][1];
        var r2 = r + dr2, c2 = c + dc2, screen = null;
        while (inBoard(r2, c2)) {
          var t2 = board[idx(r2, c2)];
          if (!t2) { res.push({ to: idx(r2, c2), hit: 'empty' }); r2 += dr2; c2 += dc2; continue; }
          // 第一个挡路的子：己方子可以叠，敌方子只能当炮架；无论敌友都是炮架
          if (colorOf(topOf(t2)) === color) res.push({ to: idx(r2, c2), hit: 'own' });
          screen = [r2, c2];
          break;
        }
        if (screen) {
          var r3 = screen[0] + dr2, c3 = screen[1] + dc2;
          while (inBoard(r3, c3)) {
            var t3 = board[idx(r3, c3)];
            if (!t3) { r3 += dr2; c3 += dc2; continue; }
            if (colorOf(topOf(t3)) !== color) res.push({ to: idx(r3, c3), hit: 'enemy' });
            break;
          }
        }
      }
    } else if (type === 'H') {
      for (var h = 0; h < 8; h++) {
        var hr = r + HORSE[h][0], hc = c + HORSE[h][1];
        if (!inBoard(hr, hc)) continue;
        var legR = r + (Math.abs(HORSE[h][0]) === 2 ? HORSE[h][0] / 2 : 0);
        var legC = c + (Math.abs(HORSE[h][1]) === 2 ? HORSE[h][1] / 2 : 0);
        if (board[idx(legR, legC)]) continue;
        add(hr, hc);
      }
    } else if (type === 'P') {
      var fwd = color === 'r' ? -1 : 1;
      add(r + fwd, c);
      var crossed = color === 'r' ? r <= 4 : r >= 5;
      if (crossed) { add(r, c - 1); add(r, c + 1); }
    } else if (type === 'A') {
      // 'free'：士斜走一格，全盘无宫禁（揭棋式）
      // 'zone'：在自家九宫内时只能待在宫内，出了宫才解禁
      var zoneA = cfg.aeMode === 'zone';
      var inside = inPalace(color, r, c);
      for (var a = 0; a < 4; a++) {
        var ar = r + DIRS_DIAG[a][0], ac = c + DIRS_DIAG[a][1];
        if (!inBoard(ar, ac)) continue;
        if (zoneA && inside) { if (!inPalace(color, ar, ac)) continue; }
        add(ar, ac);
      }
    } else if (type === 'E') {
      // 象走田，象眼照样会塞；'free' 时不受河界限制
      var zoneE = cfg.aeMode === 'zone';
      var side = ownSide(color, r);
      for (var e = 0; e < 4; e++) {
        var er = r + ELEPH[e][0], ec = c + ELEPH[e][1];
        if (!inBoard(er, ec)) continue;
        if (board[idx(r + ELEPH[e][0] / 2, c + ELEPH[e][1] / 2)]) continue; // 塞象眼
        if (zoneE && side) { if (!ownSide(color, er)) continue; }
        add(er, ec);
      }
    } else if (type === 'K') {
      for (var k = 0; k < 4; k++) {
        var kr = r + DIRS_ORTH[k][0], kc = c + DIRS_ORTH[k][1];
        if (!inPalace(color, kr, kc)) continue;
        add(kr, kc);
      }
    }
    return res;
  }

  // from 这格上的子，能不能吃到 target 格（target 上必须是敌子）
  function attacks(board, from, target, cfg) {
    var list = collect(board, from, cfg);
    for (var i = 0; i < list.length; i++) {
      if (list[i].to === target && list[i].hit === 'enemy') return true;
    }
    return false;
  }

  /* ---------------- 将军判定 ---------------- */

  function findKing(board, color) {
    for (var i = 0; i < 90; i++) {
      var cell = board[i];
      if (!cell) continue;
      var ch = topOf(cell);
      if (ch.toUpperCase() === 'K' && colorOf(ch) === color) return i;
    }
    return -1;
  }

  function isKingAttacked(board, color, cfg) {
    var k = findKing(board, color);
    if (k < 0) return false;
    var p = rc(k), kr = p[0], kc = p[1];
    var enemy = other(color);
    var i, t, rr, cc;

    // 直线：车 / 炮（隔一个炮架）/ 贴脸的其他子
    for (i = 0; i < 4; i++) {
      var dr = DIRS_ORTH[i][0], dc = DIRS_ORTH[i][1];
      rr = kr + dr; cc = kc + dc;
      var first = -1;
      while (inBoard(rr, cc)) {
        if (board[idx(rr, cc)]) { first = idx(rr, cc); break; }
        rr += dr; cc += dc;
      }
      if (first < 0) continue;
      t = board[first];
      if (colorOf(topOf(t)) === enemy && attacks(board, first, k, cfg)) return true;
      // 炮：越过炮架后第一个子
      rr = rr + dr; cc = cc + dc;
      while (inBoard(rr, cc)) {
        var t2 = board[idx(rr, cc)];
        if (t2) {
          if (colorOf(topOf(t2)) === enemy && topOf(t2).toUpperCase() === 'C') return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }

    // 贴身斜角：士
    for (i = 0; i < 4; i++) {
      rr = kr + DIRS_DIAG[i][0]; cc = kc + DIRS_DIAG[i][1];
      if (!inBoard(rr, cc)) continue;
      t = board[idx(rr, cc)];
      if (!t || colorOf(topOf(t)) !== enemy) continue;
      if (topOf(t).toUpperCase() === 'A' && attacks(board, idx(rr, cc), k, cfg)) return true;
    }

    // 马
    for (i = 0; i < 8; i++) {
      rr = kr + HORSE[i][0]; cc = kc + HORSE[i][1];
      if (!inBoard(rr, cc)) continue;
      t = board[idx(rr, cc)];
      if (!t || colorOf(topOf(t)) !== enemy) continue;
      if (topOf(t).toUpperCase() === 'H' && attacks(board, idx(rr, cc), k, cfg)) return true;
    }

    // 象（可能被叠子带过河）
    for (i = 0; i < 4; i++) {
      rr = kr + ELEPH[i][0]; cc = kc + ELEPH[i][1];
      if (!inBoard(rr, cc)) continue;
      t = board[idx(rr, cc)];
      if (!t || colorOf(topOf(t)) !== enemy) continue;
      if (topOf(t).toUpperCase() === 'E' && attacks(board, idx(rr, cc), k, cfg)) return true;
    }

    // 将帅照面
    var ek = findKing(board, enemy);
    if (ek >= 0) {
      var ep = rc(ek);
      if (ep[1] === kc) {
        var r1 = Math.min(kr, ep[0]), r2 = Math.max(kr, ep[0]), clear = true;
        for (var q = r1 + 1; q < r2; q++) if (board[idx(q, kc)]) { clear = false; break; }
        if (clear) return true;
      }
    }
    return false;
  }

  /* ---------------- 着法生成（含叠子） ---------------- */

  function genMoves(board, color, cfg) {
    var moves = [];
    for (var i = 0; i < 90; i++) {
      var cell = board[i];
      if (!cell) continue;
      var top = topOf(cell);
      if (colorOf(top) !== color) continue;
      var list = collect(board, i, cfg);
      for (var j = 0; j < list.length; j++) {
        var to = list[j].to, hit = list[j].hit;
        if (hit === 'empty') {
          // 整摞一起走
          moves.push({ from: i, to: to, kind: 'stack' });
          // 只有顶子走开（拆）
          if (cell.length > 1) moves.push({ from: i, to: to, kind: 'top' });
        } else if (hit === 'enemy') {
          // 吃子：默认整摞一起上
          moves.push({ from: i, to: to, kind: 'stack', capture: true });
          // 也可以只让顶层去吃，底子留在原地
          if (cell.length > 1) moves.push({ from: i, to: to, kind: 'top', capture: true });
        } else {
          // 叠到己方子上
          var dest = board[to];
          if (cell.length === 1 && dest.length < cfg.maxStack &&
              !hasKing(dest) && top.toUpperCase() !== 'K') {
            moves.push({ from: i, to: to, kind: 'load' });
          }
        }
      }
      // 原地换顶层
      if (cell.length > 1 && cfg.switchCostsMove) {
        for (var s = 0; s < cell.length - 1; s++) {
          moves.push({ from: i, kind: 'switch', index: s });
        }
      }
    }
    return moves;
  }

  function doMove(board, mv) {
    var b = cloneBoard(board);
    var fromCell = b[mv.from];
    if (!fromCell) return b;

    if (mv.kind === 'switch') {
      var stack = fromCell.slice();
      var pc = stack.splice(mv.index, 1)[0];
      stack.push(pc);
      b[mv.from] = stack;
      return b;
    }

    if (mv.kind === 'load') {
      var p = fromCell.pop();
      if (!fromCell.length) b[mv.from] = null;
      b[mv.to].push(p);
      return b;
    }

    if (mv.kind === 'top') {
      var tp = fromCell.pop();
      if (!fromCell.length) b[mv.from] = null;
      b[mv.to] = [tp];
      return b;
    }

    // 'stack'：整摞搬过去（目标为空或敌子）
    b[mv.from] = null;
    b[mv.to] = fromCell;
    return b;
  }

  function genLegal(board, color, cfg) {
    var all = genMoves(board, color, cfg);
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var nb = doMove(board, all[i]);
      if (!isKingAttacked(nb, color, cfg)) out.push(all[i]);
    }
    return out;
  }

  /* ---------------- 记谱 ---------------- */

  function num(color, n) { return color === 'r' ? CN[n - 1] : String(n); }

  function notation(game, mv) {
    var board = game.board, color = game.turn, cfg = game.cfg;
    var fromCell = board[mv.from];
    if (!fromCell) return '??';
    var ch = topOf(fromCell);
    var name = pieceName(ch);
    var fp = rc(mv.from), fr = fp[0], fc = fp[1];
    var fileNo = color === 'r' ? fc + 1 : 9 - fc;

    if (mv.kind === 'switch') {
      var newTop = fromCell[mv.index];
      return name + num(color, fileNo) + '换' + pieceName(newTop);
    }

    var tp = rc(mv.to), tr = tp[0], tc = tp[1];
    var tFileNo = color === 'r' ? tc + 1 : 9 - tc;

    // 同线同种子：用 前/后 区分
    var sameFile = [];
    for (var i = 0; i < 90; i++) {
      var cell = board[i];
      if (!cell) continue;
      if (topOf(cell) !== ch) continue;
      var p = rc(i);
      if (p[1] === fc) sameFile.push(p[0]);
    }
    var prefix = '';
    var useFile = true;
    if (sameFile.length > 1) {
      sameFile.sort(function (a, b) { return color === 'r' ? a - b : b - a; });
      var at = sameFile.indexOf(fr);
      if (sameFile.length === 2) { prefix = at === 0 ? '前' : '后'; useFile = false; }
      else if (sameFile.length === 3) { prefix = at === 0 ? '前' : at === 1 ? '中' : '后'; useFile = false; }
      else { prefix = ''; useFile = true; }
    }

    var action;
    if (fr === tr) {
      action = '平' + num(color, tFileNo);
    } else {
      var forward = color === 'r' ? tr < fr : tr > fr;
      var type = ch.toUpperCase();
      var step = 'HAE'.indexOf(type) >= 0 ? num(color, tFileNo) : num(color, Math.abs(tr - fr));
      action = (forward ? '进' : '退') + step;
    }

    var s = prefix + name + (useFile ? num(color, fileNo) : '') + action;
    if (mv.kind === 'load') s += '·叠';
    else if (mv.kind === 'top') s += '·拆';
    return s;
  }

  /* ---------------- 对局 ---------------- */

  function boardKey(board, turn) {
    var s = '';
    for (var i = 0; i < 90; i++) {
      var cell = board[i];
      s += cell ? cell.join('') : '-';
      s += '/';
    }
    return s + turn;
  }

  function bumpRep(g, delta) {
    var key = boardKey(g.board, g.turn);
    var n = (g.rep.get(key) || 0) + delta;
    if (n <= 0) g.rep.delete(key); else g.rep.set(key, n);
  }

  function updateResult(g) {
    g.result = null;
    var key = boardKey(g.board, g.turn);
    if ((g.rep.get(key) || 0) >= 3) {
      g.result = { type: 'draw', reason: '三次重复局面' };
      return;
    }
    var moves = genLegal(g.board, g.turn, g.cfg);
    if (!moves.length) {
      var inCheck = isKingAttacked(g.board, g.turn, g.cfg);
      g.result = { type: 'win', winner: other(g.turn), reason: inCheck ? '将死' : '困毙' };
    }
  }

  function createGame(opts) {
    var g = {
      board: initialState(),
      turn: 'r',
      cfg: normalizeCfg(opts),
      history: [],
      rep: new Map(),
      lastMove: null,
      result: null
    };
    bumpRep(g, 1);
    updateResult(g);
    return g;
  }

  function legalMoves(g) { return genLegal(g.board, g.turn, g.cfg); }

  function sameMove(a, b) {
    return a.from === b.from && a.to === b.to && a.kind === b.kind &&
      (a.index === undefined ? b.index === undefined : a.index === b.index);
  }

  function play(g, mv) {
    if (g.result) return null;
    var legal = legalMoves(g);
    var found = null;
    for (var i = 0; i < legal.length; i++) if (sameMove(legal[i], mv)) { found = legal[i]; break; }
    if (!found) return null;

    var note = notation(g, found);
    var captured = null;
    if (found.capture && g.board[found.to]) {
      captured = g.board[found.to].slice();
    }

    g.history.push({
      board: g.board,
      turn: g.turn,
      lastMove: g.lastMove,
      move: found,
      notation: note,
      captured: captured
    });

    g.board = doMove(g.board, found);
    g.turn = other(g.turn);
    g.lastMove = { from: found.from, to: found.to, kind: found.kind };
    bumpRep(g, 1);
    updateResult(g);
    return note;
  }

  function undo(g) {
    var h = g.history.pop();
    if (!h) return false;
    bumpRep(g, -1);
    g.board = h.board;
    g.turn = h.turn;
    g.lastMove = h.lastMove;
    g.result = null;
    return true;
  }

  /* ---------------- 导出 ---------------- */

  return {
    COLS: COLS, ROWS: ROWS,
    NAMES: NAMES, DEFAULT_CFG: DEFAULT_CFG,
    colorOf: colorOf, other: other, idx: idx, rc: rc,
    inBoard: inBoard, inPalace: inPalace, ownSide: ownSide,
    topOf: topOf, hasKing: hasKing, pieceName: pieceName, cloneBoard: cloneBoard,
    initialState: initialState, normalizeCfg: normalizeCfg,
    collect: collect, attacks: attacks,
    findKing: findKing, isKingAttacked: isKingAttacked,
    genMoves: genMoves, genLegal: genLegal, doMove: doMove,
    notation: notation, boardKey: boardKey,
    createGame: createGame, legalMoves: legalMoves, play: play, undo: undo,
    updateResult: updateResult
  };
});
