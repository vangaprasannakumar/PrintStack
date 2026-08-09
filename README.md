# PrintStack

Tells you exactly what to print, and when to flip the stack — for manual duplex, N-up, and booklet printing on any printer, including ones without automatic double-sided printing.

Everything runs in the browser. No page content or PDF data is ever uploaded anywhere — including when generating a ready-to-print PDF, which is built entirely client-side.

---

## Files in this package

| File | Purpose |
|---|---|
| `index.html` | The app itself — markup, styles, and UI logic. No build step. |
| `manifest.json` | PWA manifest (name, icons, colors) — lets the app be installed to a home screen or desktop. |
| `sw.js` | Service worker — caches the app shell so it also works offline once loaded. |
| `print-logic.js` | The core page-arithmetic logic (parsing, sequential + booklet imposition, reverse-stack handling), loaded by `index.html` via a plain `<script>` tag. |
| `logic.test.js` | Automated tests for `print-logic.js`, using Node's built-in test runner. |
| `package.json` | Exists only so `npm test` works. Not a build step — the deployed app is still plain static files. |

All six files are flat — no subfolders. Keep it that way: `index.html` loads `./print-logic.js` at runtime, and `manifest.json`/`sw.js` both assume the main file is named `index.html`. If you rename it, update `start_url` in `manifest.json` and the `./index.html` entries in `sw.js` to match.

```
.
├── index.html
├── manifest.json
├── sw.js
├── package.json
├── print-logic.js
└── logic.test.js
```

> **If the app loads but never actually calculates anything** (you type a page count and nothing happens, or a loaded PDF gets a "couldn't read that PDF" error even though the page count field updated): open your browser's dev tools console. If you see a 404 for `print-logic.js`, it means that file isn't sitting in the same folder as `index.html` on your host — move it there, or fix the `<script src="...">` path in `index.html` to match wherever it actually is. The service worker can mask this fix on a repeat visit by continuing to serve an old cached copy — bump `CACHE_NAME` in `sw.js` (or hard-refresh / clear site data) after fixing the path.

## Deploying it

Any static file host works — GitHub Pages, Netlify, Vercel, S3, or a plain web server. Two things to know:

- **HTTPS is required** for the service worker (and therefore "Install app" / offline support) to activate — except on `localhost`, which is exempt for local testing. Opening the file directly from disk (`file://`) will run the app fine, but install/offline support won't work.
- On first load, the app installs the service worker, which pre-caches the app shell (`index.html`, `manifest.json`, `print-logic.js`, the two icons, and PDF.js). After that, it'll load from cache even with no connection — a small banner appears at the top whenever you actually go offline, so it's clear the app is running on the cached copy rather than failing silently.

To test locally: `python3 -m http.server 8000` from the folder, then open `http://localhost:8000`.

## Using the app

**Pages** — type a total page count (`24`) or a specific range (`1-10, 15`). Or drop a PDF anywhere on the page (or tap **Choose a file**) and PrintStack counts its pages for you — and once a PDF's loaded, the live preview renders actual thumbnails of those pages instead of plain numbered boxes.

**Page order** — `Sequential` prints pages in normal reading order across sheets. `Booklet (fold & staple)` reorders pages into saddle-stitch imposition, so that after printing, folding the whole stack in half, and stapling the spine, the pages read in order. Booklet mode needs a page count that's a multiple of 4 (pad your source PDF with blank pages at the end if it isn't — the app tells you exactly how many).

**Pages per sheet** — how many document pages get printed onto one physical side (N-up). Locked to 2 in booklet mode, since saddle-stitch imposition is inherently a 2-up layout.

**Print mode** — `Duplex` splits the job into two batches (Set 1 = fronts, Set 2 = backs) for printers without automatic double-siding. `Simplex` gives you a single ordered list for one-sided printing.

**Flip edge** — whether you'll flip the printed stack on its long or short edge before the second pass. Changes the on-screen flip instructions to match.

**Page orientation** — Portrait or Landscape. This only changes the shape of the live preview so it actually looks like your paper — it doesn't change the page order or output text, since paper orientation doesn't affect which pages go where.

**Reverse Set 2 for top-feed printers** — most inkjets and many laser printers pull from the top of the tray. Turn this on and PrintStack reverses and, where needed, tells you to relocate one sheet so Set 2 lines up correctly after you flip and reload the stack. Turn it off if your printer feeds from the bottom.

**Preview** — shows exactly how one physical sheet will look, front and back, with real page thumbnails once a PDF is loaded (plain page numbers otherwise). Use the arrows to step through every sheet in the job, not just the first.

**Set 1 / Set 2** — copy each list straight into your print dialog's page-range field, download it as a `.txt` file, or — once a PDF is loaded — download it as a ready-to-print **PDF** with the pages already extracted and reordered, so you can just open it and print the whole thing (no page-range typing needed).

**Offline** — a small banner appears at the top if your connection drops, letting you know you're on the cached version. It clears automatically once you're back online.

## How the math works

- **Sequential + duplex**: pages are split into chunks of `pagesPerSheet × 2` — the first half of each chunk is a sheet's front, the second half its back.
- **Reverse logic**: when the last physical sheet doesn't divide evenly, its back side ends up partial or empty. PrintStack detects this and either tells you to remove that sheet entirely (empty back) or move it from the top to the bottom of the stack after flipping (partial back) — otherwise Set 2 would print out of registration with Set 1.
- **Booklet imposition**: for `N` pages (a multiple of 4), sheet `i` (0-indexed) gets front = `[page N−2i, page 2i+1]` and back = `[page 2i+2, page N−2i−1]`. This is the standard saddle-stitch formula — it's what lets a plain "N pages per sheet" print-dialog setting produce a correctly folding booklet, since the dialog lays out consecutive entries from your supplied page list left-to-right on each sheet.

All of this lives in `print-logic.js` as plain, dependency-free functions — see **Testing** below for how it's verified.

## Real PDF thumbnails

Once a PDF is dropped or chosen, `index.html` keeps a reference to the loaded PDF.js document. When the preview renders a sheet, each mini-page cell that maps to a real page in that document is rendered as an actual low-resolution thumbnail (via a `<canvas>`, converted to a data URL and cached in memory) instead of a plain number — with a small page-number badge overlaid in the corner. A few implementation notes if you're extending this:

- Rendering is async and only happens for the sheet currently on screen — navigating with the preview's prev/next arrows renders on demand, not the whole document up front.
- A generation counter discards any in-flight render that's been superseded by a newer one (e.g. you click "next" before the previous thumbnail finished rendering).
- The thumbnail cache is capped at 48 pages (oldest evicted first) so browsing a very long document doesn't grow memory unbounded.
- If no PDF has been loaded — pages typed in manually — cells fall back to the plain numbered-box style as before.

## Ready-to-print PDF export

When a source PDF is loaded, each output set gets a **Download PDF** button alongside the copy/`.txt` options. It uses [pdf-lib](https://pdf-lib.js.org/) to open the same source bytes, copy just the pages in `Set 1` (or `Set 2`) in the exact order shown in the output box, and save that as a new standalone PDF — so instead of typing a page range into your print dialog, you just open the downloaded file and print all of it.

A few notes:

- **Requires a loaded PDF.** If you only typed a page count manually, there's no source content to extract pages from — the button stays hidden and a small hint explains why.
- It still relies on your printer driver's own "pages per sheet" (N-up) setting for the multi-page-per-sheet layout — this generates a page-order-corrected PDF, not a fully composited imposition PDF with multiple pages already laid out on one sheet. That compositing step (drawing multiple source pages onto one output page) is a reasonable future addition, noted below.
- If your typed page range includes numbers beyond the loaded PDF's actual page count (e.g. you edited the count after loading), those are silently skipped in the exported file and you'll see a note saying so — the on-screen Set 1/Set 2 text is unaffected.
- This one is browser-only — `print-logic.js`'s tests don't cover it, since it depends on pdf-lib and real PDF bytes rather than pure arithmetic. See **Known limitations**.

## Customizing

- **Colors, type, spacing**: all in the `:root` and `[data-theme="dark"]` CSS custom properties near the top of `<style>` in `index.html`. Change a token once and it propagates everywhere.
- **Core page math**: lives entirely in `print-logic.js`, separate from the UI code in `index.html`. Change it there and the test suite will tell you immediately if something broke.
- **Icons**: update the two `href`/`src` URLs (used in `<link rel="icon">`, the header logo, and `manifest.json`) and the matching entries in `sw.js`'s `ASSETS_TO_CACHE`.
- **Cache version**: `sw.js` has a `CACHE_NAME` constant with a comment reminder — bump it (`printstack-v5` → `printstack-v6`) any time you change `index.html`, `manifest.json`, or `print-logic.js`, or returning visitors will keep getting the old cached version.
- **Page cap**: `MAX_PAGES` near the top of the script in `index.html` (currently 5,000) — the point at which the app truncates input and shows a warning, to avoid hanging the browser on a stray huge number.
- **Thumbnail cache size**: `THUMB_CACHE_CAP` near the top of the script in `index.html` (currently 48 pages).

## Testing

`print-logic.js` is loaded two ways from the same file: as a plain `<script>` tag in the browser, and via `require()` in the test suite — so the tests always exercise exactly what ships, never a copy that can drift out of sync.

```
npm test
```

or directly:

```
node --test logic.test.js
```

Requires Node 18+ (uses the built-in test runner — no dependencies to install). Covers input parsing (including malformed/ignored tokens), sequential chunking (even, empty-back, and partial-back cases), booklet imposition (rejection of non-multiples-of-4, correct page pairing, and a full folded-reading-order reconstruction check), the reverse/alert logic, and the flip-guide copy.

## Known limitations

- **No Subresource Integrity (SRI) hashes** on the PDF.js or pdf-lib `<script>` tags. This wasn't skipped by accident — computing the exact hash requires access the build environment didn't have, and a wrong hash would silently block the script from loading at all. If you want this hardening, cdnjs.com's own copy-paste snippet for each library's exact version includes the correct `integrity` attribute.
- Booklet mode assumes a single saddle-stitched signature (one fold), which covers the common case but not multi-signature (perfect-bound) booklets.
- The offline indicator uses the browser's standard `online`/`offline` events, which are a reasonable but imperfect signal (e.g. a captive Wi-Fi portal can still report "online").
- **PDF export reorders pages but doesn't composite N-up layouts.** It produces a PDF with pages in the correct print order; your printer's own "pages per sheet" setting still handles the visual N-up grouping. A fully composited version (multiple source pages drawn onto one output page) isn't implemented yet.

## Browser support

Built on standard, broadly-supported web APIs: Drag-and-drop, the File API, `localStorage`, the Clipboard API (with an `execCommand` fallback for older browsers), Canvas, and Service Workers. Works in current Chrome, Edge, Firefox, and Safari, on both desktop and mobile.
