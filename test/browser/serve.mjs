// Serves the repository root, so pages import /index.js as a consumer would.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };
const port = Number(process.env.PORT ?? 8124);

createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  const file = resolve(repo, "." + (path.endsWith("/") ? path + "index.html" : path));
  if (!file.startsWith(repo)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/`));
