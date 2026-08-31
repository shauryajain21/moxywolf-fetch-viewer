import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const COLORS = {
  ref: "#1f6feb",
  statement: "#2da44e",
  heading: "#d29922",
  gdpr: "#8250df",
  glossary: "#6e7781",
};

let pdfDoc = null;
let pageIndex = { items: [], viewport: { width: 1, height: 1 } };
let boxes = [];
let currentPage = 1;
let selectedId = "";
const ALWAYS_KINDS = new Set(["ref", "heading"]);
let showAll = true;
let onSelect = () => {};

const stage = () => document.getElementById("pdf-stage");
const canvas = () => document.getElementById("pdf-canvas");
const overlay = () => document.getElementById("pdf-overlay");
const pageLabel = () => document.getElementById("page-label");

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9.:,;()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function itemRect(item, viewport) {
  const m = item.transform;
  const x = m[4];
  const y = m[5];
  const w = item.width || 0;
  const h = item.height || Math.abs(m[3]) || 10;
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([x, y, x + w, y + h]);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
    str: item.str || "",
  };
}

function mergeLines(rects) {
  const lines = [];
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(5, it.h * 0.45));
    if (!line) {
      lines.push({ ...it });
      continue;
    }
    const right = Math.max(line.x + line.w, it.x + it.w);
    const bottom = Math.max(line.y + line.h, it.y + it.h);
    line.x = Math.min(line.x, it.x);
    line.y = Math.min(line.y, it.y);
    line.w = right - line.x;
    line.h = bottom - line.y;
  }
  return lines;
}

function indexPage(rects) {
  let hay = "";
  const map = [];
  for (const item of rects) {
    const n = normalize(item.str);
    if (!n) continue;
    if (hay) hay += " ";
    const start = hay.length;
    hay += n;
    map.push({ start, end: hay.length, item });
  }
  return { hay, map };
}

function needlesFor(query) {
  const q = normalize(query);
  if (q.length < 3) return [];
  const out = [q];
  if (q.length > 90) out.push(q.slice(0, 90));
  const words = q.split(" ");
  if (words.length > 8) out.push(words.slice(0, 8).join(" "));
  return [...new Set(out)];
}

function findHits(index, query) {
  for (const q of needlesFor(query)) {
    const hits = [];
    let from = 0;
    while (from < index.hay.length) {
      const i = index.hay.indexOf(q, from);
      if (i < 0) break;
      const j = i + q.length;
      const involved = index.map.filter((m) => m.start < j && m.end > i).map((m) => m.item);
      if (involved.length) hits.push(involved);
      from = i + Math.max(1, q.length);
    }
    if (hits.length) return hits;
  }
  return [];
}

function tagQueries(data) {
  const tags = [];
  for (const c of data.criteria || []) {
    if (c.reference) tags.push({ id: `${c.reference}:ref`, kind: "ref", query: c.reference });
    if (c.statement) {
      tags.push({ id: `${c.reference}:statement`, kind: "statement", query: c.statement });
    }
    for (const h of c.point_of_focus_headings || []) {
      tags.push({ id: `${c.reference}:heading:${h}`, kind: "heading", query: h });
    }
  }
  return tags;
}

export function setOverlayHandler(fn) {
  onSelect = fn;
}

export function selectTag(id, { jump = true } = {}) {
  selectedId = id;
  const first = boxes.find((b) => b.id === id);
  if (jump && first && first.page !== currentPage) {
    showPage(first.page);
    return;
  }
  paintBoxes();
}

function paintBoxes() {
  const layer = overlay();
  const vp = pageIndex.viewport;
  layer.replaceChildren();
  const visible = boxes.filter((b) => {
    if (b.page !== currentPage) return false;
    if (selectedId && b.id === selectedId) return true;
    return showAll && ALWAYS_KINDS.has(b.kind);
  });
  for (const b of visible) {
    const div = document.createElement("div");
    div.className = "box" + (b.id === selectedId ? " selected" : "");
    div.style.left = `${(b.x / vp.width) * 100}%`;
    div.style.top = `${(b.y / vp.height) * 100}%`;
    div.style.width = `${(b.w / vp.width) * 100}%`;
    div.style.height = `${(b.h / vp.height) * 100}%`;
    div.style.borderColor = COLORS[b.kind] || COLORS.ref;
    div.style.background = `${COLORS[b.kind] || COLORS.ref}33`;
    div.title = `${b.kind} · ${b.query}`;
    div.addEventListener("click", (event) => {
      event.stopPropagation();
      selectTag(b.id, { jump: false });
      onSelect(b.id);
    });
    layer.appendChild(div);
  }
}

async function extractPage(pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.35 });
  const text = await page.getTextContent();
  const rects = text.items.filter((it) => it.str).map((it) => itemRect(it, viewport));
  return { page, viewport, rects, index: indexPage(rects) };
}

async function buildBoxes(data) {
  boxes = [];
  if (!pdfDoc) return;
  const tags = tagQueries(data);
  for (let n = 1; n <= pdfDoc.numPages; n++) {
    const extracted = await extractPage(n);
    for (const tag of tags) {
      for (const hit of findHits(extracted.index, tag.query)) {
        for (const line of mergeLines(hit)) {
          boxes.push({ ...tag, ...line, page: n });
        }
      }
    }
  }
}

async function renderCanvas() {
  if (!pdfDoc) return;
  const extracted = await extractPage(currentPage);
  pageIndex = extracted;
  const { page, viewport } = extracted;
  const c = canvas();
  const ctx = c.getContext("2d");
  c.width = viewport.width;
  c.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  pageLabel().textContent = `${currentPage} / ${pdfDoc.numPages}`;
  paintBoxes();
}

export async function showPage(n) {
  if (!pdfDoc) return;
  currentPage = Math.min(Math.max(1, n), pdfDoc.numPages);
  await renderCanvas();
}

export async function loadPdf(url, data) {
  const proxied = `/api/pdf?url=${encodeURIComponent(url)}`;
  pdfDoc = await pdfjsLib.getDocument({ url: proxied }).promise;
  currentPage = 1;
  await buildBoxes(data);
  const firstRef = boxes.find((b) => b.kind === "ref") || boxes[0];
  if (firstRef) currentPage = firstRef.page;
  await renderCanvas();
  return { pages: pdfDoc.numPages, boxes: boxes.length };
}

export function setShowAll(value) {
  showAll = value;
  paintBoxes();
}

export function bindPager() {
  document.getElementById("prev-page").onclick = () => showPage(currentPage - 1);
  document.getElementById("next-page").onclick = () => showPage(currentPage + 1);
  document.getElementById("toggle-boxes").onchange = (event) => {
    setShowAll(event.target.checked);
  };
}

export { COLORS };
