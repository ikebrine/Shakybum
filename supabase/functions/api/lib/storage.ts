import { newId } from "./id.ts";

// Uses Supabase's own Storage product (S3-compatible object storage, part
// of the same project/dashboard) — deliberately NOT a third-party service
// like S3/Cloudinary/Mux, to keep the whole stack at Vercel + Supabase.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected into
// Supabase Edge Functions — confirmed: `supabase secrets set` actively
// refuses to let you set anything prefixed SUPABASE_ ("Env name cannot
// start with SUPABASE_, skipping"), which is the platform protecting its
// own reserved/auto-provided values. No manual setup needed for these two.
// The service role key bypasses Row Level Security — it must NEVER be sent
// to the frontend. The frontend uploads a video to OUR backend (which
// requires a valid user JWT via requireAuth), and only this backend code
// talks to Supabase Storage directly. The frontend never sees this key.
const BUCKET = "videos";

function supabaseUrl() {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("SUPABASE_URL is not set — see lib/storage.ts for setup.");
  return url.replace(/\/$/, "");
}
function serviceRoleKey() {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — see lib/storage.ts for setup.");
  return key;
}

/**
 * Creates the videos bucket if it doesn't already exist. Called once at
 * cold start from lib/db.ts's migrate() — deliberately non-fatal on
 * failure (logged, not thrown) so a transient Storage API hiccup doesn't
 * take down auth/every other route that has nothing to do with video
 * upload; upload attempts will just fail individually until this succeeds.
 */
export async function ensureVideosBucket() {
  try {
    const res = await fetch(`${supabaseUrl()}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey()}`,
        apikey: serviceRoleKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    });
    if (res.ok) {
      console.log(`[storage] bucket "${BUCKET}" created`);
      return;
    }
    const body = await res.json().catch(() => ({}));
    // Supabase returns 409/400 with a "already exists"-style message when
    // the bucket is already there — that's the expected steady-state after
    // the first successful cold start, not an error worth logging loudly.
    if (res.status === 409 || /already exists/i.test(body?.message || "")) return;
    console.error(`[storage] bucket creation returned ${res.status}:`, body);
  } catch (err) {
    console.error("[storage] bucket creation failed (non-fatal):", err);
  }
}

/**
 * Uploads raw video bytes to Supabase Storage and returns the real,
 * permanent public URL — replaces the session-only Blob URLs the frontend
 * used before this existed.
 */
export async function uploadVideo({ userId, bytes, contentType }: { userId: string; bytes: ArrayBuffer; contentType: string }) {
  const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("quicktime") ? "mov" : "webm";
  const path = `${userId}/${newId("vid")}.${ext}`;

  const res = await fetch(`${supabaseUrl()}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey()}`,
      apikey: serviceRoleKey(),
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: new Blob([bytes], { type: contentType }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Video upload failed: ${body?.message || res.statusText}`);
  }

  return `${supabaseUrl()}/storage/v1/object/public/${BUCKET}/${path}`;
}
