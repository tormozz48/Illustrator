import { Hono } from "hono";

import { listChaptersWithMeta } from "../db/chapter.db.js";
import { getIllustrationR2Key } from "../db/illustration.db.js";
import type { Env } from "../types.js";

const chapters = new Hono<{ Bindings: Env }>();

// ── GET /api/books/:id/chapters ──────────────────────────────────────────────
chapters.get("/", async (ctx) => {
  const bookId = ctx.req.param("id");
  if (!bookId) {
    return ctx.json({ error: "Missing book id" }, 400);
  }
  const results = await listChaptersWithMeta(ctx.env.DB, bookId);
  return ctx.json(results);
});

// ── GET /api/books/:id/chapters/:num/img ─────────────────────────────────────
// Streams the illustration image for a chapter directly from R2.
chapters.get("/:num/img", async (ctx) => {
  const bookId = ctx.req.param("id") ?? "";
  const num = Number.parseInt(ctx.req.param("num") ?? "", 10);

  if (Number.isNaN(num)) {
    return ctx.json({ error: "Invalid chapter number" }, 400);
  }

  const row = await getIllustrationR2Key(ctx.env.DB, bookId, num);
  if (!row) {
    return ctx.json({ error: "Illustration not found" }, 404);
  }

  const obj = await ctx.env.BOOKS_BUCKET.get(row.r2_key);
  if (!obj) {
    return ctx.json({ error: "Image missing from storage" }, 500);
  }

  const headers = new Headers();
  headers.set("Content-Type", obj.httpMetadata?.contentType ?? "image/webp");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (obj.size) {
    headers.set("Content-Length", String(obj.size));
  }

  return new Response(obj.body, { headers });
});

export { chapters };
