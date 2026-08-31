# moxywolf-fetch-viewer

Minimal browser UI for [Linkup `/fetch`](https://docs.linkup.so/pages/documentation/endpoints/fetch/overview) on a public PDF.

It does two things:

1. Calls `/fetch` with a schema and shows a collapsible tag tree (same idea as Moxywolf’s hierarchy HTML).
2. Renders the PDF and draws colored boxes over text that matches those tags.

Fetch does **not** return bounding boxes. Boxes are text matches on the page.

## Run

Needs Node 18+ (built-in `fetch`). No `npm install`.

```bash
git clone https://github.com/shauryajain21/moxywolf-fetch-viewer.git
cd moxywolf-fetch-viewer
npm start
```

Open [http://127.0.0.1:3344](http://127.0.0.1:3344).

The AICPA Privacy Management Framework sample loads immediately (cached Fetch JSON + the public PDF). Paste a Linkup API key and click **Fetch and render** to hit a live PDF URL.

The key is sent to this local server, then to `api.linkup.so`. It is not written to disk.

## What you see

| Color | Tag |
| --- | --- |
| Blue | Criterion id (`M1.0`) |
| Gold | Point-of-focus heading |
| Green | Statement (when you select it) |
| Purple | GDPR article list (when it matches) |

Click a tree row to jump to that box. Click a box to select the row. **Show all boxes** toggles ids/headings on the current page.

First load scans every page so it can jump to the first id. That takes a few seconds on a 30+ page PDF.

## What works on any URL

- **Public `https` PDF** — the page will render.
- **Fetch** — any public URL Fetch can retrieve.

The schema in `server.mjs` is written for this PMF-style mapping tool (ids like `M1.0`, headings, GDPR articles, glossary). A random PDF often returns empty `criteria` and therefore **no boxes**. Login-walled files and HTML pages will not get a boxed PDF view.

## Layout

- `server.mjs` — static files, `POST /api/fetch` (Linkup proxy), `GET /api/pdf` (PDF proxy)
- `public/app.js` — tree + wiring
- `public/overlay.js` — PDF.js render + text matching
- `public/sample.json` — last successful Fetch `data` for the PMF sample
