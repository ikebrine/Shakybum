import { Hono } from "npm:hono@4";
import { requireAuth } from "../middleware/auth.ts";
import { uploadVideo } from "../lib/storage.ts";
import type { AppEnv } from "../lib/honoTypes.ts";

const app = new Hono<AppEnv>();

// 100MB cap — generous for the 15-60s clips this app actually records
// (real-world size for that duration is much smaller), but bounds the
// worst case against someone deliberately uploading something huge.
const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_TYPES = ["video/webm", "video/mp4", "video/quicktime"];

app.post("/upload", requireAuth, async (c) => {
  const me = c.get("user");
  const contentType = c.req.header("content-type") || "";

  if (!ALLOWED_TYPES.some((t) => contentType.startsWith(t))) {
    return c.json({ error: `Unsupported content type "${contentType}" — expected one of: ${ALLOWED_TYPES.join(", ")}` }, 400);
  }

  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) {
    return c.json({ error: "Empty upload" }, 400);
  }
  if (bytes.byteLength > MAX_BYTES) {
    return c.json({ error: `Video too large (max ${MAX_BYTES / (1024 * 1024)}MB)` }, 413);
  }

  try {
    const url = await uploadVideo({ userId: me.id, bytes, contentType });
    return c.json({ url }, 201);
  } catch (err) {
    console.error("Video upload failed:", err);
    return c.json({ error: "Upload failed — please try again" }, 502);
  }
});

export default app;
