/* 规则引擎自测：node tests/run-tests.js */
'use strict';

const assert = require('assert');
const XQ = require('../rules.js');
const AI = require('../ai.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) {
    console.log('FAIL  ' + name);
    console.log(e && e.stack || e);
    process.exitCode = 1;
  }
}

function emptyBoard() { return new Array(90).fill(null); }
function put(b, r, c, pieces) { b[XQ.idx(r, c)] = Array.isArray(pieces) ? pieces.slice() : [pieces]; }
function mkGame(board, turn, cfg) {
  const g = XQ.createGame(cfg || {});
  g.board = board; g.turn = turn; g.rep = new Map();
  g.rep.set(XQ.boardKey(g.board, g.turn), 1);
  g.history = []; g.lastMove = null; g.result = null;
  return g;
}
function movesFrom(g, from) {
  return XQ.legalMoves(g).filter(m => m.from === from);
}
function hasTo(list, to) { return list.some(m => m.to === to); }
// 双方将帅分别放在不同纵线，避免“照面”干扰用例
function kingsOnly() {
  const b = emptyBoard();
  put(b, 9, 4, 'K');
  put(b, 0, 3, 'k');
  return b;
}

console.log('\n[1] 开局叠子');
test('车一平二可以叠到马上', () => {
  const g = XQ.createGame({});
  const mv = XQ.legalMoves(g).filter(m =>
    m.from === XQ.idx(9, 0) && m.to === XQ.idx(9, 1) && m.kind === 'load');
  assert.strictEqual(mv.length, 1, '应该有一步 load');
  const nb = XQ.doMove(g.board, mv[0]);
  assert.deepStrictEqual(nb[XQ.idx(9, 1)], ['H', 'R']);
  assert.strictEqual(nb[XQ.idx(9, 0)], null);
});

test('叠加后顶子是车，马的走法被覆盖', () => {
  let b = XQ.initialState();
  b = XQ.doMove(b, { from: XQ.idx(9, 0), to: XQ.idx(9, 1), kind: 'load' });
  const g = mkGame(b, 'r');
  const ms = movesFrom(g, XQ.idx(9, 1));
  assert.ok(!hasTo(ms, XQ.idx(8, 3)), '不该出现马步');
  assert.ok(!hasTo(ms, XQ.idx(7, 0)), '不该出现马步');
  assert.ok(hasTo(ms, XQ.idx(8, 1)), '车的直行应该可用');
});

console.log('\n[2] 整摞走 / 拆开走');
test('整摞移动带着下面的子一起走', () => {
  let b = XQ.initialState();
  b = XQ.doMove(b, { from: XQ.idx(9, 0), to: XQ.idx(9, 1), kind: 'load' });
  const nb = XQ.doMove(b, { from: XQ.idx(9, 1), to: XQ.idx(8, 1), kind: 'stack' });
  assert.deepStrictEqual(nb[XQ.idx(8, 1)], ['H', 'R']);
  assert.strictEqual(nb[XQ.idx(9, 1)], null);
});
test('只走顶层则底子留在原地', () => {
  let b = XQ.initialState();
  b = XQ.doMove(b, { from: XQ.idx(9, 0), to: XQ.idx(9, 1), kind: 'load' });
  const nb = XQ.doMove(b, { from: XQ.idx(9, 1), to: XQ.idx(8, 1), kind: 'top' });
  assert.deepStrictEqual(nb[XQ.idx(8, 1)], ['R']);
  assert.deepStrictEqual(nb[XQ.idx(9, 1)], ['H']);
});

console.log('\n[3] 吃子');
test('整摞被吃就全部没了', () => {
  const b = kingsOnly();
  put(b, 5, 4, ['H', 'R']);   // 马在下、车在上
  put(b, 5, 7, 'r');          // 黑车
  const g = mkGame(b, 'r');
  const mv = movesFrom(g, XQ.idx(5, 4)).find(m => m.to === XQ.idx(5, 7));
  assert.ok(mv && mv.kind === 'stack', '应该能整摞吃');
  const nb = XQ.doMove(b, mv);
  assert.deepStrictEqual(nb[XQ.idx(5, 7)], ['H', 'R']);
  assert.ok(!nb.some(c => c && c.length === 1 && c[0] === 'r'), '黑车应该没了');
});
test('炮可以隔着自己的子吃整摞', () => {
  const b = kingsOnly();
  put(b, 5, 0, 'C');          // 红炮
  put(b, 5, 3, 'P');          // 炮架是红兵（自己的子也算炮架）
  put(b, 5, 5, ['h', 'r']);   // 黑方一摞
  const g = mkGame(b, 'r');
  const mv = movesFrom(g, XQ.idx(5, 0)).find(m => m.to === XQ.idx(5, 5));
  assert.ok(mv && mv.capture, '炮应能隔子吃整摞');
});
test('兵可以吃整摞（低子换高子）', () => {
  const b = kingsOnly();
  put(b, 4, 4, 'P');          // 已过河的红兵
  put(b, 3, 4, ['h', 'r']);   // 黑方一摞
  const g = mkGame(b, 'r');
  const mv = movesFrom(g, XQ.idx(4, 4)).find(m => m.to === XQ.idx(3, 4));
  assert.ok(mv && mv.capture, '兵应能整摞吃');
  const nb = XQ.doMove(b, mv);
  assert.deepStrictEqual(nb[XQ.idx(3, 4)], ['P']);
});
test('吃子也可以只让顶层去吃，底子留在原地', () => {
  const b = kingsOnly();
  put(b, 4, 5, ['P', 'H']);   // 兵在下、马在上
  put(b, 2, 6, 'r');          // 黑车，正好在马步上
  const g = mkGame(b, 'r');
  const list = movesFrom(g, XQ.idx(4, 5)).filter(m => m.to === XQ.idx(2, 6));
  assert.strictEqual(list.length, 2, '应有整摞吃和顶子吃两种');
  const stackMove = list.find(m => m.kind === 'stack');
  const topMove = list.find(m => m.kind === 'top');
  assert.ok(stackMove && topMove);

  const b1 = XQ.doMove(b, stackMove);
  assert.deepStrictEqual(b1[XQ.idx(2, 6)], ['P', 'H'], '整摞吃：两个子都过去');
  assert.strictEqual(b1[XQ.idx(4, 5)], null);

  const b2 = XQ.doMove(b, topMove);
  assert.deepStrictEqual(b2[XQ.idx(2, 6)], ['H'], '顶子吃：只有马过去');
  assert.deepStrictEqual(b2[XQ.idx(4, 5)], ['P'], '兵留在原地');
});

console.log('\n[4] 士象（揭棋式 / 分区制）');
test('揭棋式：士在九宫边上可以自己走出去', () => {
  const b = kingsOnly();
  put(b, 7, 3, 'A');
  const g = mkGame(b, 'r');                    // 默认 aeMode: 'free'
  const ms = movesFrom(g, XQ.idx(7, 3));
  assert.strictEqual(ms.length, 4);
  assert.ok(hasTo(ms, XQ.idx(6, 4)), '应能走出九宫');
});
test('分区制：宫内的士仍然只能待在宫里', () => {
  const b = kingsOnly();
  put(b, 7, 3, 'A');
  const g = mkGame(b, 'r', { aeMode: 'zone' });
  const ms = movesFrom(g, XQ.idx(7, 3));
  assert.strictEqual(ms.length, 1, '只有回宫中心一步');
  assert.ok(hasTo(ms, XQ.idx(8, 4)));
});
test('揭棋式：象可以自己过河', () => {
  const b = kingsOnly();
  put(b, 6, 5, 'E');
  const g = mkGame(b, 'r');
  const ms = movesFrom(g, XQ.idx(6, 5));
  assert.strictEqual(ms.length, 4);
  assert.ok(hasTo(ms, XQ.idx(4, 3)), '应能过河');
});
test('分区制：没过河的象不能自己过河', () => {
  const b = kingsOnly();
  put(b, 6, 5, 'E');
  const g = mkGame(b, 'r', { aeMode: 'zone' });
  const ms = movesFrom(g, XQ.idx(6, 5));
  assert.strictEqual(ms.length, 2);
  ms.forEach(m => {
    const [r] = XQ.rc(m.to);
    assert.ok(r >= 5, '不能越河');
  });
});
test('象眼被塞时两种模式都走不了', () => {
  const b = kingsOnly();
  put(b, 2, 3, 'E');
  put(b, 1, 2, 'p');
  const g = mkGame(b, 'r');
  const ms = movesFrom(g, XQ.idx(2, 3));
  assert.ok(!hasTo(ms, XQ.idx(0, 1)), '象眼被塞不能走');
});

console.log('\n[5] 将帅');
test('不能把子叠到帅上', () => {
  const b = kingsOnly();
  put(b, 7, 4, 'R');
  const g = mkGame(b, 'r');
  const ms = movesFrom(g, XQ.idx(7, 4));
  assert.ok(!hasTo(ms, XQ.idx(9, 4)), '车不能落到帅位');
});
test('帅自己不能叠到别的子上', () => {
  const b = kingsOnly();
  put(b, 9, 5, 'R');
  const g = mkGame(b, 'r');
  const ms = movesFrom(g, XQ.idx(9, 4));
  assert.ok(ms.every(m => m.kind !== 'load'), '帅不能叠');
});

console.log('\n[6] 上限与换顶层');
test('上限 2 时不能再往上叠', () => {
  const b = kingsOnly();
  put(b, 9, 0, 'R');
  put(b, 9, 1, ['H', 'C']);
  const g = mkGame(b, 'r');
  const ms = movesFrom(g, XQ.idx(9, 0));
  assert.ok(!hasTo(ms, XQ.idx(9, 1)), '已经两层，不能再叠');
});
test('上限可配成 3（实验）', () => {
  const b = kingsOnly();
  put(b, 9, 0, 'R');
  put(b, 9, 1, ['H', 'C']);
  const g = mkGame(b, 'r', { maxStack: 3 });
  const ms = movesFrom(g, XQ.idx(9, 0));
  assert.ok(hasTo(ms, XQ.idx(9, 1)), '上限 3 时可以叠成三子');
});
test('换顶层算一步棋，换完马就能走', () => {
  let b = XQ.initialState();
  b = XQ.doMove(b, { from: XQ.idx(9, 0), to: XQ.idx(9, 1), kind: 'load' });
  const g = mkGame(b, 'r');
  const sw = movesFrom(g, XQ.idx(9, 1)).find(m => m.kind === 'switch' && m.index === 0);
  assert.ok(sw, '应该有换顶的着法');
  const note = XQ.play(g, sw);
  assert.ok(note && note.indexOf('换') >= 0, note);
  assert.strictEqual(g.turn, 'b', '换顶要交出手');
  assert.deepStrictEqual(g.board[XQ.idx(9, 1)], ['R', 'H']);
  g.turn = 'r';
  const ms = movesFrom(g, XQ.idx(9, 1));
  assert.ok(hasTo(ms, XQ.idx(7, 0)), '换成马之后马步应该出现');
});

console.log('\n[7] 将军 / 胜负 / 和棋');
test('被车照面判定为将军', () => {
  const b = emptyBoard();
  put(b, 9, 4, 'K');
  put(b, 0, 3, 'k');
  put(b, 3, 4, 'r');
  assert.ok(XQ.isKingAttacked(b, 'r', XQ.normalizeCfg({})));
});
test('将帅照面算违规', () => {
  const b = emptyBoard();
  put(b, 9, 4, 'K');
  put(b, 0, 4, 'k');
  assert.ok(XQ.isKingAttacked(b, 'r', XQ.normalizeCfg({})));
});
test('将死能判出来', () => {
  const b = emptyBoard();
  put(b, 9, 4, 'K');
  put(b, 0, 3, 'k');
  put(b, 0, 0, 'R');
  put(b, 1, 0, 'R');
  const g = mkGame(b, 'b');
  XQ.updateResult(g);
  assert.ok(g.result && g.result.type === 'win' && g.result.winner === 'r', JSON.stringify(g.result));
});
test('三次重复局面判和', () => {
  const b = emptyBoard();
  put(b, 9, 4, 'K');
  put(b, 0, 3, 'k');
  put(b, 9, 0, 'R');
  put(b, 0, 0, 'r');
  const g = mkGame(b, 'r');
  const cyc = [
    { from: XQ.idx(9, 0), to: XQ.idx(8, 0), kind: 'stack' },
    { from: XQ.idx(0, 0), to: XQ.idx(1, 0), kind: 'stack' },
    { from: XQ.idx(8, 0), to: XQ.idx(9, 0), kind: 'stack' },
    { from: XQ.idx(1, 0), to: XQ.idx(0, 0), kind: 'stack' }
  ];
  for (let i = 0; i < 8; i++) {
    const r = XQ.play(g, cyc[i % 4]);
    assert.ok(r, '第 ' + i + ' 步应为合法：' + JSON.stringify(cyc[i % 4]));
  }
  assert.ok(g.result && g.result.type === 'draw', JSON.stringify(g.result));
});

console.log('\n[8] 记谱');
test('开局几步的中文记谱', () => {
  const g = XQ.createGame({});
  const n1 = XQ.play(g, { from: XQ.idx(9, 0), to: XQ.idx(8, 0), kind: 'stack' });
  assert.strictEqual(n1, '车一进一');
  const n2 = XQ.play(g, { from: XQ.idx(0, 1), to: XQ.idx(2, 2), kind: 'stack' });
  assert.ok(n2, '黑方应能走');
  const n3 = XQ.play(g, { from: XQ.idx(9, 1), to: XQ.idx(7, 2), kind: 'stack' });
  assert.strictEqual(n3, '马二进三');
});
test('叠子的着法带标记', () => {
  const g = XQ.createGame({});
  const n = XQ.play(g, { from: XQ.idx(9, 0), to: XQ.idx(9, 1), kind: 'load' });
  assert.ok(n.indexOf('叠') >= 0, n);
});

console.log('\n[9] 压力测试');
test('随机自对弈 240 步不崩、不变量成立', () => {
  let g = XQ.createGame({ maxStack: 2 });
  for (let i = 0; i < 240 && !g.result; i++) {
    const ms = XQ.legalMoves(g);
    if (!ms.length) break;
    const mv = ms[(Math.random() * ms.length) | 0];
    assert.ok(XQ.play(g, mv), '合法着法应能落子');
    for (let k = 0; k < 90; k++) {
      const cell = g.board[k];
      if (!cell) continue;
      assert.ok(cell.length >= 1 && cell.length <= 2, '摞高越界');
      assert.ok(!(cell.length > 1 && XQ.hasKing(cell)), '将帅混进了摞里');
    }
  }
  assert.ok(g.history.length > 20, '至少走了不少步');
});
test('AI 总能给出合法着法', () => {
  const g = XQ.createGame({});
  const mv = AI.chooseMove(g, { depth: 2, timeMs: 800 });
  assert.ok(mv, '应有着法');
  assert.ok(XQ.legalMoves(g).some(m =>
    m.from === mv.from && m.to === mv.to && m.kind === mv.kind), 'AI 着法必须合法');
});
test('AI 会吃掉白送的车', () => {
  let b = XQ.initialState();
  b[XQ.idx(0, 0)] = null;          // 挪走黑方原来的车
  put(b, 5, 0, 'r');               // 白送一个黑车在 a5
  const g = mkGame(b, 'r');
  const mv = AI.chooseMove(g, { depth: 2, timeMs: 1000 });
  assert.ok(mv && mv.to === XQ.idx(5, 0) && mv.capture, '应该吃掉白送的车：' + JSON.stringify(mv));
});

console.log('\n' + (process.exitCode ? '有测试失败' : '全部通过') + '：' + passed + ' 项\n');
