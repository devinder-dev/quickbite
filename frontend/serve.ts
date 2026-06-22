import { resolve, sep } from "node:path";

const PORT = Number(process.env.PORT ?? 3005);
const DIST_DIR = resolve(import.meta.dir, "dist");

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ status: "ok", service: "frontend" });

    const decodedPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const resolved = resolve(DIST_DIR, decodedPath);

    // Boundary check on the RESOLVED absolute path, not a raw string
    // startsWith — "/app/dist-evil".startsWith("/app/dist") is true and is
    // the classic traversal bypass. Must also check the path separator so a
    // sibling directory that happens to share the prefix can't match.
    const withinDist = resolved === DIST_DIR || resolved.startsWith(DIST_DIR + sep);
    const file = withinDist ? Bun.file(resolved) : null;

    if (file && (await file.exists())) return new Response(file);

    // SPA fallback for any unmatched path (a client-side react-router
    // route, e.g. /orders/<uuid>) — must exist, or a hard refresh on a deep
    // link 404s instead of loading the app.
    return new Response(Bun.file(resolve(DIST_DIR, "index.html")));
  },
});

console.log(`🚀 frontend on ${PORT}`);
