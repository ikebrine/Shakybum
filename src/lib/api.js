// Real API client for the Shakybum backend. Replaces the local mock state
// that used to drive the whole app — see git history for the pre-wiring
// version if you need to compare.
//
// Base URL comes from VITE_API_BASE_URL (Vite only exposes env vars
// prefixed VITE_ to client code) — set this in Vercel's dashboard under
// Project Settings → Environment Variables.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

const TOKEN_KEY = "shakybum_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, { body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (err) {
    // Network failure (backend unreachable, CORS misconfigured, offline, etc.)
    // — surfaced distinctly from a normal 4xx/5xx API error.
    throw new ApiError(`Can't reach the server — check your connection.`, 0);
  }
  let json = null;
  try { json = await res.json(); } catch { /* empty body, e.g. some 204s */ }
  if (!res.ok) {
    throw new ApiError(json?.error || `Request failed (${res.status})`, res.status);
  }
  return json;
}

// ── Badge format: backend uses no-space enum-style ("SilverQueen"),
// frontend display/pricing tables use spaced strings ("Silver Queen") —
// this is the single place that bridges the two so nothing else in the
// app needs to know both formats exist.
const BADGE_TO_FRONTEND = {
  Newcomer: "Newcomer", RisingStar: "Rising Star", SilverQueen: "Silver Queen",
  GoldQueen: "Gold Queen", Platinum: "Platinum", Diamond: "Diamond",
};
export const badgeToFrontend = (b) => BADGE_TO_FRONTEND[b] || b;

// Maps a raw backend user object (snake-free but backend-shaped) to the
// shape the existing frontend components already expect (id, handle, name,
// avatar, badge, moves, followers, bio, bumEnabled, etc.)
export function mapUser(u) {
  if (!u) return u;
  return {
    id: u.id,
    handle: u.handle,
    name: u.name,
    bio: u.bio,
    avatar: (u.name || "?")[0].toUpperCase(),
    color: "#FF3CAC",
    badge: badgeToFrontend(u.badge),
    videoUrl: u.videoUrl || null,
    bumEnabled: !!u.bumEnabled,
    allowDownload: u.allowDownload !== false,
    moves: u.movesCount ?? 0,
    followers: u.followersCount ?? 0,
    following: u.followingCount ?? 0,
    online: false, // no presence system yet
    contact: u.contactEmail || null, // only ever populated when the backend explicitly reveals it (approved requests)
    phone: u.contactPhone || null,
    contactPrice: u.contactPrice,
    canBum: u.canBum,
    bumPrices: u.bumPrices,
  };
}

export const api = {
  auth: {
    signup: (body) => request("POST", "/auth/signup", { body, auth: false }),
    login: (body) => request("POST", "/auth/login", { body, auth: false }),
    me: () => request("GET", "/auth/me"),
  },
  users: {
    list: () => request("GET", "/users"),
    get: (handle) => request("GET", `/users/${handle}`),
    updateProfile: (body) => request("PATCH", "/users/me", { body }),
    updateContactInfo: (body) => request("PUT", "/users/me/contact-info", { body }),
    setPayoutDestination: (body) => request("POST", "/users/me/payout-destination", { body }),
    setBumSettings: (body) => request("PATCH", "/users/me/bum-settings", { body }),
    follow: (userId) => request("POST", `/users/${userId}/follow`),
    unfollow: (userId) => request("DELETE", `/users/${userId}/follow`),
    followers: (userId) => request("GET", `/users/${userId}/followers`),
    following: (userId) => request("GET", `/users/${userId}/following`),
  },
  contactRequests: {
    initiate: (body) => request("POST", "/contact-requests", { body }),
    sent: () => request("GET", "/contact-requests/sent"),
    received: () => request("GET", "/contact-requests/received"),
    get: (id) => request("GET", `/contact-requests/${id}`),
    approve: (id) => request("POST", `/contact-requests/${id}/approve`),
    decline: (id) => request("POST", `/contact-requests/${id}/decline`),
  },
  bumSessions: {
    initiate: (body) => request("POST", "/bum-sessions", { body }),
    sent: () => request("GET", "/bum-sessions/sent"),
    received: () => request("GET", "/bum-sessions/received"),
    active: () => request("GET", "/bum-sessions/active"),
    get: (id) => request("GET", `/bum-sessions/${id}`),
    approve: (id) => request("POST", `/bum-sessions/${id}/approve`),
    decline: (id) => request("POST", `/bum-sessions/${id}/decline`),
    start: (id) => request("POST", `/bum-sessions/${id}/start`),
    end: (id) => request("POST", `/bum-sessions/${id}/end`),
    extend: (id, body) => request("POST", `/bum-sessions/${id}/extend`, { body }),
  },
  chat: {
    messages: (userId) => request("GET", `/chat/${userId}/messages`),
    send: (userId, text) => request("POST", `/chat/${userId}/messages`, { body: { text } }),
  },
  notifications: {
    list: () => request("GET", "/notifications"),
    markRead: (id) => request("POST", `/notifications/${id}/read`),
  },
  media: {
    // Raw binary upload — doesn't go through request() since that always
    // sends JSON. Returns a real, permanent URL (Supabase Storage) instead
    // of the session-only blob: URL the recorder produces locally.
    uploadVideo: async (blob) => {
      const token = getToken();
      const res = await fetch(`${API_BASE}/media/upload`, {
        method: "POST",
        headers: {
          "Content-Type": blob.type || "video/webm",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: blob,
      });
      let json = null;
      try { json = await res.json(); } catch { /* empty body */ }
      if (!res.ok) throw new ApiError(json?.error || `Upload failed (${res.status})`, res.status);
      return json; // { url }
    },
  },
  posts: {
    create: (body) => request("POST", "/posts", { body }), // { videoUrl, caption, moveTag, kind: "post"|"short" }
    feed: (kind = "post", { limit, before } = {}) => {
      const params = new URLSearchParams({ kind, ...(limit ? { limit } : {}), ...(before ? { before } : {}) });
      return request("GET", `/posts?${params}`);
    },
    byUser: (userId, kind) => request("GET", `/posts/user/${userId}${kind ? `?kind=${kind}` : ""}`),
    get: (id) => request("GET", `/posts/${id}`),
    delete: (id) => request("DELETE", `/posts/${id}`),
    like: (id) => request("POST", `/posts/${id}/like`),
    unlike: (id) => request("DELETE", `/posts/${id}/like`),
    comments: (id) => request("GET", `/posts/${id}/comments`),
    comment: (id, text) => request("POST", `/posts/${id}/comments`, { body: { text } }),
  },
};

/**
 * Polls a fetcher function until `until(result)` returns true, or timeoutMs
 * elapses. Used for the "payment initiated, waiting for MoMo webhook
 * confirmation" step — there's no websocket/push yet (see backend README
 * "Known gaps"), so this is a deliberate poll rather than a bug.
 */
export async function pollUntil(fetcher, until, { intervalMs = 1500, timeoutMs = 45_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fetcher();
    if (until(result)) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new ApiError("Timed out waiting for payment confirmation", 408);
}

export { ApiError };
