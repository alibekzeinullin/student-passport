import https from "node:https";
import http from "node:http";
import { readFileSync } from "node:fs";
const routes = [["/rest/v1", 3001], ["/auth/v1", 9999]];
https.createServer({ key: readFileSync("key.pem"), cert: readFileSync("cert.pem") }, (req, res) => {
  const r = routes.find(([p]) => req.url.startsWith(p));
  if (!r) { res.writeHead(404); res.end("no route"); return; }
  const path = req.url.slice(r[0].length) || "/";
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": req.headers.origin ?? "*",
      "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*",
      "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "access-control-allow-credentials": "true",
      "access-control-max-age": "600",
    });
    res.end(); return;
  }
  const up = http.request({ host: "127.0.0.1", port: r[1], path, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${r[1]}` } }, (u) => {
    const h = { ...u.headers, "access-control-allow-origin": req.headers.origin ?? "*", "access-control-allow-credentials": "true", "access-control-expose-headers": "content-range, x-total-count" };
    res.writeHead(u.statusCode, h); u.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}).listen(443, "127.0.0.1", () => console.log("proxy up"));
