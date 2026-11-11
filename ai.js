/* 叠子象棋 简易 AI
 * 负极大值 + Alpha-Beta + 迭代加深 + 时间上限。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.XQAI = factory(root.XQ);
})(typeof self !== 'undefined' ? self : this, function (XQ) {
  'use strict';

  var VAL = { R: 9, C: 4.5, H: 4, A: 2, E: 2, P: 1, K: 0 };
  var MATE = 100000;

  var nodes = 0;
  var aborted = false;
  var deadline = 0;

  function evaluate(board) {
    var s = 0;
    for (var i = 0; i < 90; i++) {
      var cell = board[i];
      if (!cell) continue;
      var r = (i / 9) | 0;
      for (var j = 0; j < cell.length; j++) {
        var ch = cell[j];
        var col = XQ.colorOf(ch);
        var t = ch.toUpperCase();
        var v = VAL[t] || 0;
        if (t === 'P') {
          var adv = col === 'r' ? (9 - r) : r;   // 0..9，越大越深入敌阵
          v += adv * 0.12;
          if ((col === 'r' && r <= 4) || (col === 'b' && r >= 5)) v += 0.45; // 过河兵
        }
        s += (col === 'r' ? v : -v);
      }
    }
    return s;
  }

  function evalFor(board, turn) {
    return turn === 'r' ? evaluate(board) : -evaluate(board);
  }

  function moveScore(board, mv) {
    var sc = 0;
    if (mv.capture) {
      var cell = board[mv.to];
      if (cell) {
        for (var i = 0; i < cell.length; i++) sc += VAL[cell[i].toUpperCase()] || 0;
        sc = sc * 10 + 5;
      }
      return sc;
    }
    if (mv.kind === 'load') return 1;
    if (mv.kind === 'switch') return 0;
    return 0;
  }

  function order(board, moves) {
    var scored = [];
    for (var i = 0; i < moves.length; i++) {
      scored.push({ mv: moves[i], sc: moveScore(board, moves[i]) });
    }
    scored.sort(function (a, b) { return b.sc - a.sc; });
    for (var j = 0; j < scored.length; j++) moves[j] = scored[j].mv;
    return moves;
  }

  function search(board, turn, cfg, depth, alpha, beta, ply) {
    nodes++;
    if ((nodes & 255) === 0 && Date.now() > deadline) { aborted = true; return 0; }

    var moves = XQ.genLegal(board, turn, cfg);
    if (!moves.length) return -MATE + ply;
    if (depth <= 0) return evalFor(board, turn);

    order(board, moves);
    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var nb = XQ.doMove(board, moves[i]);
      var v = -search(nb, XQ.other(turn), cfg, depth - 1, -beta, -alpha, ply + 1);
      if (aborted) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  /**
   * @param {object} game  XQ.createGame 出来的对局
   * @param {object} opts  { depth, timeMs, noise }
   * @returns {object|null} 着法
   */
  function chooseMove(game, opts) {
    if (game.result) return null;
    opts = opts || {};
    var maxDepth = opts.depth || 3;
    var timeMs = opts.timeMs || 1200;
    var noise = opts.noise || 0;

    var cfg = game.cfg, turn = game.turn;
    var moves = XQ.genLegal(game.board, turn, cfg);
    if (!moves.length) return null;

    nodes = 0;
    aborted = false;
    deadline = Date.now() + timeMs;

    order(game.board, moves);
    var best = moves[0];
    var bestScore = -Infinity;

    for (var d = 1; d <= maxDepth; d++) {
      var localBest = null, localScore = -Infinity;
      var alpha = -Infinity;
      for (var i = 0; i < moves.length; i++) {
        if (Date.now() > deadline) { aborted = true; break; }
        var nb = XQ.doMove(game.board, moves[i]);
        var v = -search(nb, XQ.other(turn), cfg, d - 1, -Infinity, -alpha, 1);
        if (aborted) break;
        if (noise) v += (Math.random() * 2 - 1) * noise;
        if (v > localScore) { localScore = v; localBest = moves[i]; }
        if (v > alpha) alpha = v;
      }
      if (aborted) break;
      if (localBest) {
        best = localBest;
        bestScore = localScore;
        // 把最好的着法排到最前面，下一轮更快
        var at = moves.indexOf(best);
        if (at > 0) { moves.splice(at, 1); moves.unshift(best); }
      }
      if (bestScore >= MATE - 100) break;   // 已经算到杀棋
      if (Date.now() > deadline) break;
    }
    return best;
  }

  return {
    chooseMove: chooseMove, evaluate: evaluate, VAL: VAL, MATE: MATE,
    _internals: { search: search, order: order, evalFor: evalFor }
  };
});
