/**
 * PrintStack — core page-arithmetic logic.
 *
 * Pure, side-effect-free functions: parsing page input, chunking pages onto
 * sheets (sequential and booklet/saddle-stitch imposition), and the
 * reverse-for-top-feed-printer + partial-sheet handling.
 *
 * Loaded two ways from the same file (no build step, no duplication):
 *   1. In the browser: index.html includes this via a plain <script> tag,
 *      which exposes everything on `window.PrintStackLogic`.
 *   2. In Node: logic.test.js does `require('./print-logic.js')`,
 *      which uses `module.exports` instead.
 * Whichever one the app ships is exactly what the tests exercise.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PrintStackLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Parsing ----------
  // "47"        -> pages 1..47
  // "1-10, 15"  -> [1..10, 15]
  // Anything that doesn't parse as a whole number or a valid ascending range
  // (e.g. "abc", "10-", "5-2") is reported back in `ignored`, not silently
  // dropped.
  function parsePageInput(input) {
    var trimmed = input.trim();
    if (/^\d+$/.test(trimmed)) {
      var total = parseInt(trimmed, 10);
      var pages = [];
      for (var i = 1; i <= total; i++) pages.push(i);
      return { pages: pages, ignored: [] };
    }
    var out = [], ignored = [];
    var parts = trimmed.split(',');
    for (var p = 0; p < parts.length; p++) {
      var part = parts[p].trim();
      if (part === '') continue;
      if (part.indexOf('-') !== -1) {
        var bits = part.split('-');
        var start = Number(bits[0]), end = Number(bits[1]);
        if (bits.length === 2 && start && end && start <= end) {
          for (var n = start; n <= end; n++) out.push(n);
        } else {
          ignored.push(part);
        }
      } else if (/^\d+$/.test(part)) {
        out.push(parseInt(part, 10));
      } else {
        ignored.push(part);
      }
    }
    var uniq = Array.from(new Set(out)).sort(function (a, b) { return a - b; });
    return { pages: uniq, ignored: ignored };
  }

  // ---------- Sequential chunking ----------
  // Duplex: each physical sheet takes `pagesPerSheet` pages on the front and
  // the next `pagesPerSheet` on the back. Simplex: one side per sheet.
  function calcSequential(pages, pps, printMode) {
    var sheets = [];
    if (printMode === 'both') {
      var chunkSize = pps * 2;
      var totalSheets = Math.ceil(pages.length / chunkSize);
      for (var i = 0; i < totalSheets; i++) {
        var sheetStart = i * chunkSize, front = [], back = [];
        for (var j = 0; j < pps; j++) if (sheetStart + j < pages.length) front.push(pages[sheetStart + j]);
        for (var k = pps; k < chunkSize; k++) if (sheetStart + k < pages.length) back.push(pages[sheetStart + k]);
        sheets.push({ front: front, back: back });
      }
    } else {
      var totalOne = Math.ceil(pages.length / pps);
      for (var m = 0; m < totalOne; m++) {
        sheets.push({ front: pages.slice(m * pps, m * pps + pps), back: [] });
      }
    }
    return sheets;
  }

  // ---------- Booklet (saddle-stitch) imposition ----------
  // Requires a page count that's a multiple of 4 (one folded signature).
  // Returns null if it isn't, so the caller can prompt for padding/trimming.
  function calcBooklet(pages) {
    var N = pages.length;
    if (N === 0 || N % 4 !== 0) return null;
    var S = N / 4, sheets = [];
    for (var i = 0; i < S; i++) {
      var frontLeftPos = N - 1 - 2 * i, frontRightPos = 2 * i;
      var backLeftPos = 2 * i + 1, backRightPos = N - 2 - 2 * i;
      sheets.push({
        front: [pages[frontLeftPos], pages[frontRightPos]],
        back: [pages[backLeftPos], pages[backRightPos]]
      });
    }
    return sheets;
  }

  // ---------- Reverse-for-top-feed + smart partial-sheet handling ----------
  // When reversed, if the final physical sheet's back side is empty or only
  // partly filled, printing Set 2 as a plain reversal would misalign it
  // against the (already-printed, now flipped) Set 1 stack. This detects
  // that and returns an `alert` describing exactly what to physically move.
  function applyReverse(sheets, doReverse) {
    var fronts = sheets.map(function (s) { return s.front.join(','); });
    var backChunks = sheets.map(function (s) { return s.back.join(','); }).filter(function (x) { return x !== ''; });
    var alert = null;

    if (doReverse && sheets.length) {
      backChunks.reverse();
      var last = sheets[sheets.length - 1];
      if (last.front.length > 0 && last.back.length === 0) {
        alert = { type: 'remove', front: last.front };
      } else if (last.back.length > 0 && last.back.length < last.front.length) {
        var moved = backChunks.shift();
        backChunks.push(moved);
        alert = { type: 'relocate', front: last.front, back: last.back };
      }
    }
    return { set1: fronts.join(','), set2: backChunks.join(','), alert: alert };
  }

  // ---------- Flip-guide copy ----------
  function getFlipGuideText(bindEdge, layoutMode) {
    if (layoutMode === 'booklet') {
      return bindEdge === 'short'
        ? "Flip the printed stack on the short edge, reload it the same way, then print Set 2. Fold the finished stack in half and staple along the spine."
        : "Flip the printed stack on the long edge, reload it the same way, then print Set 2. Fold the finished stack in half and staple along the spine.";
    }
    return bindEdge === 'short'
      ? "Flip the printed stack on the short edge (like flipping a notepad from the bottom), reload it the same way, then print Set 2. If your printer driver offers a duplex option, set it to \u2018flip on short edge\u2019 too."
      : "Flip the printed stack on the long edge, reload it the same way (don\u2019t reorder the sheets), then print Set 2.";
  }

  return {
    parsePageInput: parsePageInput,
    calcSequential: calcSequential,
    calcBooklet: calcBooklet,
    applyReverse: applyReverse,
    getFlipGuideText: getFlipGuideText
  };
});
