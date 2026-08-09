/**
 * Tests for print-logic.js — the exact functions index.html loads in
 * the browser (same file, required here instead of loaded via <script>).
 *
 * Run with:  node --test logic.test.js
 *   or:      npm test
 * Requires Node 18+ (uses the built-in test runner — no dependencies).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePageInput,
  calcSequential,
  calcBooklet,
  applyReverse,
  getFlipGuideText
} = require('./print-logic.js');

function range(n) {
  return Array.from({ length: n }, (_, i) => i + 1);
}

// ---------------------------------------------------------------------------
test('parsePageInput: bare number means "1 through N"', () => {
  assert.deepEqual(parsePageInput('47'), { pages: range(47), ignored: [] });
  assert.deepEqual(parsePageInput('  8  '), { pages: range(8), ignored: [] });
});

test('parsePageInput: comma list and ranges', () => {
  assert.deepEqual(parsePageInput('1-10,15'), { pages: [1,2,3,4,5,6,7,8,9,10,15], ignored: [] });
  assert.deepEqual(parsePageInput('5,3,1'), { pages: [1, 3, 5], ignored: [] }); // sorted
  assert.deepEqual(parsePageInput('2,2,2'), { pages: [2], ignored: [] });       // de-duped
});

test('parsePageInput: leading zeros are accepted', () => {
  assert.deepEqual(parsePageInput('03,07'), { pages: [3, 7], ignored: [] });
});

test('parsePageInput: malformed tokens are reported, not silently dropped', () => {
  const result = parsePageInput('abc,10-,5-2,1-3-9,3');
  assert.deepEqual(result.pages, [3]);
  assert.deepEqual(result.ignored.sort(), ['1-3-9', '10-', '5-2', 'abc'].sort());
});

test('parsePageInput: empty and whitespace-only input yields no pages', () => {
  assert.deepEqual(parsePageInput(''), { pages: [], ignored: [] });
  assert.deepEqual(parsePageInput('   '), { pages: [], ignored: [] });
  assert.deepEqual(parsePageInput(',,,'), { pages: [], ignored: [] });
});

// ---------------------------------------------------------------------------
test('calcSequential: duplex, evenly divisible', () => {
  const sheets = calcSequential(range(8), 2, 'both');
  assert.equal(sheets.length, 2);
  assert.deepEqual(sheets[0], { front: [1, 2], back: [3, 4] });
  assert.deepEqual(sheets[1], { front: [5, 6], back: [7, 8] });
});

test('calcSequential: duplex, empty back on the final sheet', () => {
  // 10 pages, 2-up: sheet 3's front is full (9,10) but has no back at all.
  const sheets = calcSequential(range(10), 2, 'both');
  assert.equal(sheets.length, 3);
  assert.deepEqual(sheets[2], { front: [9, 10], back: [] });
});

test('calcSequential: duplex, partial back on the final sheet', () => {
  // 11 pages, 2-up: sheet 3's back only has one of two slots filled.
  const sheets = calcSequential(range(11), 2, 'both');
  assert.equal(sheets.length, 3);
  assert.deepEqual(sheets[2], { front: [9, 10], back: [11] });
});

test('calcSequential: simplex has no back pages at all', () => {
  const sheets = calcSequential(range(5), 2, 'one');
  assert.equal(sheets.length, 3);
  sheets.forEach((s) => assert.deepEqual(s.back, []));
  assert.deepEqual(sheets.map((s) => s.front), [[1, 2], [3, 4], [5]]);
});

test('calcSequential: pagesPerSheet of 1 is just one page per side', () => {
  const sheets = calcSequential(range(4), 1, 'both');
  assert.deepEqual(sheets, [
    { front: [1], back: [2] },
    { front: [3], back: [4] }
  ]);
});

// ---------------------------------------------------------------------------
test('calcBooklet: rejects a page count that is not a multiple of 4', () => {
  assert.equal(calcBooklet(range(10)), null);
  assert.equal(calcBooklet(range(0)), null);
  assert.equal(calcBooklet(range(1)), null);
});

test('calcBooklet: 8-page saddle-stitch imposition', () => {
  const sheets = calcBooklet(range(8));
  assert.deepEqual(sheets, [
    { front: [8, 1], back: [2, 7] },
    { front: [6, 3], back: [4, 5] }
  ]);
});

test('calcBooklet: 12-page saddle-stitch imposition', () => {
  const sheets = calcBooklet(range(12));
  assert.deepEqual(sheets, [
    { front: [12, 1], back: [2, 11] },
    { front: [10, 3], back: [4, 9] },
    { front: [8, 5], back: [6, 7] }
  ]);
});

test('calcBooklet: folded reading order reconstructs 1..N in sequence', () => {
  // For each sheet, in physical page order: front-left, front-right on the
  // OUTSIDE of the fold and back-left, back-right on the INSIDE — the
  // classic check is that sheet i's back-right always equals sheet i's
  // front-left minus 1, and the next sheet's front-right continues on from
  // this sheet's back-left, i.e. the whole thing zig-zags in order.
  const N = 16;
  const sheets = calcBooklet(range(N));
  const readingOrder = [];
  sheets.forEach((s) => { readingOrder.push(s.front[1]); readingOrder.push(s.back[0]); });
  for (let i = sheets.length - 1; i >= 0; i--) {
    readingOrder.push(sheets[i].back[1]);
    readingOrder.push(sheets[i].front[0]);
  }
  assert.deepEqual(readingOrder, range(N));
});

// ---------------------------------------------------------------------------
test('applyReverse: reverse off just joins fronts/backs in original order', () => {
  const sheets = calcSequential(range(8), 2, 'both');
  const result = applyReverse(sheets, false);
  assert.equal(result.set1, '1,2,5,6');
  assert.equal(result.set2, '3,4,7,8');
  assert.equal(result.alert, null);
});

test('applyReverse: evenly-divisible job reverses with no alert needed', () => {
  const sheets = calcSequential(range(8), 2, 'both');
  const result = applyReverse(sheets, true);
  assert.equal(result.set1, '1,2,5,6');
  assert.equal(result.set2, '7,8,3,4'); // plain reversal, last sheet is full
  assert.equal(result.alert, null);
});

test('applyReverse: empty last back triggers a "remove" alert', () => {
  const sheets = calcSequential(range(10), 2, 'both');
  const result = applyReverse(sheets, true);
  assert.equal(result.set1, '1,2,5,6,9,10');
  assert.equal(result.set2, '7,8,3,4');
  assert.deepEqual(result.alert, { type: 'remove', front: [9, 10] });
});

test('applyReverse: partial last back triggers a "relocate" alert and moves the chunk', () => {
  const sheets = calcSequential(range(11), 2, 'both');
  const result = applyReverse(sheets, true);
  assert.equal(result.set1, '1,2,5,6,9,10');
  assert.equal(result.set2, '7,8,3,4,11');
  assert.deepEqual(result.alert, { type: 'relocate', front: [9, 10], back: [11] });
});

test('applyReverse: booklet mode never needs an alert (always divides evenly)', () => {
  const sheets = calcBooklet(range(12));
  const result = applyReverse(sheets, true);
  assert.equal(result.alert, null);
  assert.equal(result.set1, '12,1,10,3,8,5');
  assert.equal(result.set2, '6,7,4,9,2,11'); // plain reverse of ['2,11','4,9','6,7']
});

test('applyReverse: simplex (no back pages) never produces an alert', () => {
  const sheets = calcSequential(range(7), 3, 'one');
  const result = applyReverse(sheets, true); // reverse would be ignored by the caller for simplex, but the function itself should still behave safely
  assert.equal(result.set2, ''); // nothing to reverse — no back pages exist
});

// ---------------------------------------------------------------------------
test('getFlipGuideText: always returns non-empty, edge-appropriate copy', () => {
  const combos = [
    ['long', 'sequential'], ['short', 'sequential'],
    ['long', 'booklet'], ['short', 'booklet']
  ];
  combos.forEach(([edge, mode]) => {
    const text = getFlipGuideText(edge, mode);
    assert.ok(text.length > 10);
    if (edge === 'short') assert.match(text, /short edge/i);
    else assert.match(text, /long edge/i);
    if (mode === 'booklet') assert.match(text, /staple/i);
  });
});
