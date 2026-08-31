import { bindPager, loadPdf, selectTag, setOverlayHandler } from "./overlay.js";

const titleEl = document.getElementById("t");
const subEl = document.getElementById("s");
const root = document.getElementById("root");
const warnBox = document.getElementById("w");
const errEl = document.getElementById("err");
const goBtn = document.getElementById("go");

const COMPONENT_TITLES = {
  M1: "Management",
  N2: "Agreement, notice and communication",
  C3: "Collection and creation",
  U4: "Use, retention and disposal",
  A5: "Access",
  D6: "Disclosure to third parties",
  S7: "Security for privacy",
  Q8: "Data quality and integrity",
  M9: "Monitoring and enforcement",
};

const DEFAULT_PDF = document.getElementById("url").value;

function componentId(reference) {
  const m = String(reference || "").match(/^([A-Z]\d+)/);
  return m ? m[1] : "Other";
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function markActive(id) {
  root.querySelectorAll(".active").forEach((n) => n.classList.remove("active"));
  const hit = root.querySelector(`[data-tag="${CSS.escape(id)}"]`);
  if (hit) hit.classList.add("active");
}

function bindJump(node, id) {
  if (!id) return;
  node.dataset.tag = id;
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    markActive(id);
    selectTag(id);
  });
}

function leaf(into, ref, guidance, tagId) {
  const div = el("div", "leaf");
  div.append(el("span", "ref", ref), el("span", "guid", guidance ? ` ${guidance}` : ""));
  bindJump(div, tagId);
  into.appendChild(div);
}

function branch(into, ref, guidance, count, open = false, tagId = "") {
  const det = el("details");
  det.open = open;
  const sum = el("summary");
  sum.append(el("span", "ref", ref));
  if (guidance) sum.append(el("span", "guid", ` ${guidance}`));
  if (count != null) sum.append(el("span", "count", `(${count})`));
  bindJump(sum, tagId);
  det.appendChild(sum);
  const node = el("div", "node");
  det.appendChild(node);
  into.appendChild(det);
  return node;
}

function renderTree(data) {
  root.replaceChildren();
  warnBox.replaceChildren();
  const criteria = data.criteria || [];
  const glossary = data.glossary_terms || [];
  const groups = new Map();
  for (const c of criteria) {
    const id = componentId(c.reference);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(c);
  }

  titleEl.textContent = data.document_title || "privacy-management-framework";
  document.title = titleEl.textContent;

  for (const [id, items] of groups) {
    const node = branch(root, id, COMPONENT_TITLES[id] || "", items.length, true);
    for (const c of items) {
      const child = branch(
        node,
        c.reference,
        c.title || "",
        (c.point_of_focus_headings || []).length + (c.statement ? 1 : 0),
        false,
        `${c.reference}:ref`,
      );
      if (c.statement) leaf(child, c.reference, c.statement, `${c.reference}:statement`);
      for (const h of c.point_of_focus_headings || []) {
        leaf(child, c.reference, h, `${c.reference}:heading:${h}`);
      }
      if (c.gdpr_articles?.length) {
        leaf(child, "GDPR", c.gdpr_articles.join(", "), `${c.reference}:ref`);
      }
    }
  }

  if (glossary.length) {
    const node = branch(root, "Glossary", "", glossary.length, false);
    for (const term of glossary) leaf(node, term, "");
  }
}

function showError(msg) {
  errEl.textContent = msg || "";
}

async function showDocument(data, pdfUrl) {
  renderTree(data);
  subEl.textContent = "Loading PDF and lining up boxes…";
  const info = await loadPdf(pdfUrl, data);
  subEl.textContent = `${data.criteria?.length || 0} criteria · ${info.boxes} boxes · ${info.pages} pages`;
}

setOverlayHandler(markActive);
bindPager();

document.getElementById("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  const apiKey = document.getElementById("key").value.trim();
  const url = document.getElementById("url").value.trim();
  if (!apiKey) {
    showError("API key is required to call Fetch.");
    return;
  }
  goBtn.disabled = true;
  goBtn.textContent = "Fetching…";
  try {
    const res = await fetch("/api/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey, url }),
    });
    const body = await res.json();
    if (!res.ok || body.error) {
      const msg = body.error?.message || body.error || `HTTP ${res.status}`;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    if (!body.data) throw new Error("Fetch returned no data.");
    await showDocument(body.data, url);
  } catch (err) {
    showError(err.message);
  } finally {
    goBtn.disabled = false;
    goBtn.textContent = "Fetch and render";
  }
});

document.getElementById("sample").addEventListener("click", async () => {
  showError("");
  const res = await fetch("/sample.json");
  await showDocument(await res.json(), document.getElementById("url").value || DEFAULT_PDF);
});

document.getElementById("ex").onclick = () =>
  document.querySelectorAll("details").forEach((d) => (d.open = true));
document.getElementById("co").onclick = () =>
  document.querySelectorAll("details").forEach((d) => (d.open = false));

fetch("/sample.json")
  .then((r) => r.json())
  .then((data) => showDocument(data, DEFAULT_PDF))
  .catch((err) => showError(err.message));
