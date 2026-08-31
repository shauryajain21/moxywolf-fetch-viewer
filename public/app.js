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

function leaf(into, ref, guidance) {
  const div = el("div", "leaf");
  div.append(el("span", "ref", ref), el("span", "guid", guidance ? ` ${guidance}` : ""));
  into.appendChild(div);
}

function branch(into, ref, guidance, count, open = false) {
  const det = el("details");
  det.open = open;
  const sum = el("summary");
  sum.append(el("span", "ref", ref));
  if (guidance) sum.append(el("span", "guid", ` ${guidance}`));
  if (count != null) sum.append(el("span", "count", `(${count})`));
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
  subEl.textContent = `${criteria.length} criteria · ${glossary.length} glossary terms · from /fetch`;

  for (const [id, items] of groups) {
    const node = branch(root, id, COMPONENT_TITLES[id] || "", items.length, true);
    for (const c of items) {
      const kids = [];
      if (c.statement) kids.push(["statement", c.statement]);
      for (const h of c.point_of_focus_headings || []) kids.push(["heading", h]);
      if (c.gdpr_articles?.length) kids.push(["gdpr", c.gdpr_articles.join(", ")]);
      const child = branch(node, c.reference, c.title || "", kids.length);
      for (const [kind, text] of kids) leaf(child, kind === "gdpr" ? "GDPR" : c.reference, text);
    }
  }

  if (glossary.length) {
    const node = branch(root, "Glossary", "", glossary.length, true);
    for (const term of glossary) leaf(node, term, "");
  }
}

function showError(msg) {
  errEl.textContent = msg || "";
}

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
    renderTree(body.data);
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
  renderTree(await res.json());
});

document.getElementById("ex").onclick = () =>
  document.querySelectorAll("details").forEach((d) => (d.open = true));
document.getElementById("co").onclick = () =>
  document.querySelectorAll("details").forEach((d) => (d.open = false));

fetch("/sample.json")
  .then((r) => r.json())
  .then(renderTree)
  .catch(() => {});
