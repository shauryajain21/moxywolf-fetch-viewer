import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const PORT = Number(process.env.PORT) || 3344;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const SCHEMA = {
  type: "object",
  properties: {
    criteria: {
      type: "array",
      description:
        "Each PMF criterion from the mapping tool, one object per id like M1.0 or N2.1",
      items: {
        type: "object",
        properties: {
          reference: { type: "string", description: "Criterion id such as M1.0" },
          title: { type: "string", description: "Short name if present, else empty" },
          statement: {
            type: "string",
            description: "The criterion statement paragraph",
          },
          point_of_focus_headings: {
            type: "array",
            items: { type: "string" },
            description: "Labels that end with a colon under this criterion",
          },
          gdpr_articles: { type: "array", items: { type: "string" } },
        },
      },
    },
    glossary_terms: {
      type: "array",
      items: { type: "string" },
      description: "Appendix A term names only",
    },
  },
};

const INSTRUCTIONS =
  "Mapping tool criteria only plus Appendix A term names. Skip headers, contributors, front matter, and table column titles. Do not attach the glossary to M9.1. Deduplicate criterion ids.";

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let file = url.pathname === "/" ? "/index.html" : url.pathname;
  const full = path.normalize(path.join(ROOT, file));
  if (!full.startsWith(ROOT)) return send(res, 403, "forbidden");
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, "not found");
    send(res, 200, data, {
      "content-type": TYPES[path.extname(full)] || "application/octet-stream",
    });
  });
}

async function proxyFetch(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return send(res, 400, JSON.stringify({ error: "invalid json" }), {
      "content-type": "application/json",
    });
  }
  const apiKey = payload.apiKey;
  const url = payload.url;
  if (!apiKey || !url) {
    return send(res, 400, JSON.stringify({ error: "apiKey and url are required" }), {
      "content-type": "application/json",
    });
  }

  const upstream = await fetch("https://api.linkup.so/v1/fetch", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      url,
      mode: "standard",
      schema: SCHEMA,
      instructions: INSTRUCTIONS,
    }),
  });

  const text = await upstream.text();
  send(res, upstream.status, text, { "content-type": "application/json" });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/fetch") {
    proxyFetch(req, res).catch((err) => {
      send(res, 502, JSON.stringify({ error: String(err) }), {
        "content-type": "application/json",
      });
    });
    return;
  }
  if (req.method !== "GET") return send(res, 405, "method not allowed");
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`http://127.0.0.1:${PORT}`);
});
