/* 界面冒烟测试：用最小 DOM 桩在 Node 里跑一遍 app.js 的点击链路
 * node tests/dom-smoke.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const XQ = require('../rules.js');
const AI = require('../ai.js');

/* ---------- 极简 DOM ---------- */

function allChildren(el, out) {
  out = out || [];
  el.children.forEach(c => { out.push(c); allChildren(c, out); });
  return out;
}

class Style {
  constructor() { this._v = {}; }
  setProperty(k, v) { this[k] = v; }
}

class El {
  constructor(tag, attrs) {
    this.tagName = tag;
    this.children = [];
    this.parentNode = null;
    this.style = new Style();
    this.attrs = Object.assign({}, attrs || {});
    this._classes = '';
    this._text = '';
    this._html = '';
    this.listeners = {};
    this.hidden = false;
    this.value = '';
    this.clientWidth = 636;
  }
  get className() { return this._classes; }
  set className(v) { this._classes = String(v); }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  dispatch(t, ev) { (this.listeners[t] || []).slice().forEach(f => f.call(this, ev)); }
  get classList() {
    const self = this;
    function set() { return new Set(self._classes.split(/\s+/).filter(Boolean)); }
    return {
      add(c) { const s = set(); s.add(c); self._classes = [...s].join(' '); },
      remove(c) { const s = set(); s.delete(c); self._classes = [...s].join(' '); },
      contains(c) { return set().has(c); },
      toggle(c, on) { const s = set(); const v = on === undefined ? !s.has(c) : !!on; v ? s.add(c) : s.delete(c); self._classes = [...s].join(' '); }
    };
  }
  querySelectorAll(sel) {
    const m = /^#([\w-]+)\s+(\w+)$/.exec(sel);
    if (m) {
      const root = idMap.get(m[1]);
      return root ? allChildren(root).filter(x => x.tagName === m[2]) : [];
    }
    if (/^\w+$/.test(sel)) return allChildren(this).filter(x => x.tagName === sel);
    return [];
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 636, height: 704 }; }
}

const idMap = new Map();

function mk(tag, id, attrs) {
  const e = new El(tag, attrs);
  if (id) idMap.set(id, e);
  return e;
}

/* ---------- 按 index.html 搭出关键节点 ---------- */

const boardCol = mk('div', 'boardCol');
const boardBox = mk('div', 'boardBox');
const boardWrap = mk('div', 'boardWrap');
const boardSvg = mk('svg', 'boardSvg');
const hlLayer = mk('div', 'hlLayer');
const pieceLayer = mk('div', 'pieceLayer');
const tgtLayer = mk('div', 'tgtLayer');
const fxLayer = mk('div', 'fxLayer');
boardBox.appendChild(boardWrap);
boardWrap.appendChild(boardSvg);
boardWrap.appendChild(hlLayer);
boardWrap.appendChild(pieceLayer);
boardWrap.appendChild(tgtLayer);
boardWrap.appendChild(fxLayer);
boardCol.appendChild(boardBox);

mk('div', 'status');
mk('div', 'substatus');
mk('button', 'undoBtn');
mk('button', 'newBtn');
mk('div', 'selText');
const modeRow = mk('div', 'modeRow');
const bStack = mk('button', 'mbStack', { 'data-mode': 'stack' });
const bTop = mk('button', 'mbTop', { 'data-mode': 'top' });
modeRow.appendChild(bStack);
modeRow.appendChild(bTop);
mk('button', 'switchBtn');
const modeSel = mk('select', 'modeSel'); modeSel.value = 'pve-b';
const diffSel = mk('select', 'diffSel'); diffSel.value = 'normal';
const capSel = mk('select', 'capSel'); capSel.value = '2';
const aeSel = mk('select', 'aeSel'); aeSel.value = 'free';
const fxSel = mk('select', 'fxSel'); fxSel.value = 'on';
mk('div', 'movelist');

const document = {
  querySelector(sel) {
    if (sel[0] === '#') return idMap.get(sel.slice(1)) || null;
    return null;
  },
  querySelectorAll(sel) {
    if (sel[0] === '#') {
      const m = /^#([\w-]+)\s+(\w+)$/.exec(sel);
      if (m) {
        const root = idMap.get(m[1]);
        return root ? allChildren(root).filter(x => x.tagName === m[2]) : [];
      }
      return [];
    }
    return [];
  },
  createElement(tag) { return new El(tag); },
  createElementNS(ns, tag) { return new El(tag); },
  addEventListener() {}
};

const window = { innerHeight: 900, innerWidth: 1100, addEventListener() {}, XQ: XQ, XQAI: AI };

/* ---------- 跑 app.js ---------- */

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
new Function('window', 'document', src)(window, document);

function clickCell(r, c) {
  boardWrap.dispatch('click', { clientX: 46 + c * 68, clientY: 46 + r * 68 });
}

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('FAIL  ' + name); console.log(e && e.stack || e); process.exitCode = 1; }
}

console.log('\n[界面冒烟]');

test('页面初始化：棋盘线条与棋子都画出来了', () => {
  assert.ok(window.__game, '应有对局对象');
  assert.ok(boardSvg.children.length >= 2, 'SVG 应有内容');
  assert.strictEqual(pieceLayer.children.length, 32, '开局 32 个棋子');
});

test('点车、点马：完成一次叠子', () => {
  capSel.value = '2';
  modeSel.value = 'pvp';
  idMap.get('newBtn').dispatch('click');
  const g = window.__game;
  clickCell(9, 0);          // 选红车
  clickCell(9, 1);          // 叠到马上
  assert.deepStrictEqual(g.board[XQ.idx(9, 1)], ['H', 'R']);
  assert.strictEqual(g.board[XQ.idx(9, 0)], null);
  assert.strictEqual(g.turn, 'b');
  assert.ok(fxLayer.children.length > 0, '合体应该有特效');
});

test('黑方走一步（马二进三那类），轮到红方', () => {
  const g = window.__game;
  clickCell(0, 1);          // 黑马
  clickCell(2, 2);
  assert.strictEqual(g.turn, 'r');
  assert.deepStrictEqual(g.board[XQ.idx(2, 2)], ['h']);
});

test('叠子后选中该摞会显示“整摞/只走上层”', () => {
  clickCell(9, 1);
  assert.strictEqual(modeRow.hidden, false, '两层棋子应显示模式切换');
  assert.strictEqual(idMap.get('switchBtn').hidden, false, '应显示换顶层按钮');
  assert.strictEqual(pieceLayer.children.length, 31, '叠子后棋子数量少一个');
});

test('换顶层按钮可用，且算一步棋', () => {
  const g = window.__game;
  idMap.get('switchBtn').dispatch('click');
  assert.deepStrictEqual(g.board[XQ.idx(9, 1)], ['R', 'H']);
  assert.strictEqual(g.turn, 'b', '换顶层后交出手');
});

test('整摞移动会带着底子一起走', () => {
  const g = window.__game;
  clickCell(2, 7); clickCell(2, 3);   // 黑炮平移，交出先手
  assert.strictEqual(g.turn, 'r', '轮到红方');
  clickCell(9, 1);                    // 选这摞（此时顶子是马）
  clickCell(7, 0);                    // 马步
  assert.deepStrictEqual(g.board[XQ.idx(7, 0)], ['R', 'H']);
  assert.strictEqual(g.board[XQ.idx(9, 1)], null);
});

test('悔棋能回退', () => {
  const g = window.__game;
  const before = g.history.length;
  idMap.get('undoBtn').dispatch('click');
  assert.strictEqual(g.history.length, before - 1);
  assert.ok(g.board[XQ.idx(9, 1)], '棋子应回到原处');
});

test('点空白处只是取消选择，不会崩', () => {
  clickCell(4, 4);
  assert.ok(true);
});

test('上限 3 能叠三层', () => {
  modeSel.value = 'pvp';
  capSel.value = '3';
  idMap.get('newBtn').dispatch('click');
  const g = window.__game;
  clickCell(9, 0); clickCell(9, 1);   // 车叠马
  assert.deepStrictEqual(g.board[XQ.idx(9, 1)], ['H', 'R']);
  clickCell(0, 1); clickCell(2, 2);   // 黑方走一步
  clickCell(7, 1); clickCell(9, 1);   // 红炮叠上去（第 3 层）
  assert.deepStrictEqual(g.board[XQ.idx(9, 1)], ['H', 'R', 'C']);
  assert.strictEqual(pieceLayer.children.length, 30);
});

test('只走上层时吃子，底子不会跟着走（回归用例）', () => {
  modeSel.value = 'pvp';
  capSel.value = '2';
  idMap.get('newBtn').dispatch('click');
  const g = window.__game;
  const b = new Array(90).fill(null);
  b[XQ.idx(9, 4)] = ['K'];
  b[XQ.idx(0, 3)] = ['k'];
  b[XQ.idx(4, 5)] = ['P', 'H'];   // 兵在下、马在上
  b[XQ.idx(2, 6)] = ['r'];        // 黑车
  g.board = b; g.turn = 'r'; g.history = []; g.rep = new Map();
  g.lastMove = null; g.result = null;

  clickCell(4, 5);                // 选中这摞
  assert.strictEqual(modeRow.hidden, false, '两层应出现模式切换');
  const before = fxLayer.children.length;
  bTop.dispatch('click');         // 切到“只走上层”
  clickCell(2, 6);                // 马踩车
  assert.deepStrictEqual(g.board[XQ.idx(2, 6)], ['H'], '只有马过去');
  assert.deepStrictEqual(g.board[XQ.idx(4, 5)], ['P'], '兵应该留在原地');
  assert.ok(fxLayer.children.length > before, '吃子应该有特效');
});

console.log('\n' + (process.exitCode ? '有失败' : '全部通过') + '：' + passed + ' 项\n');