import { db } from "../db/index.js";
import { newId } from "../lib/id.js";

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    handle: row.handle,
    name: row.name,
    passwordHash: row.password_hash,
    bio: row.bio,
    avatarEmoji: row.avatar_emoji,
    badge: row.badge,
    bumEnabled: !!row.bum_enabled,
    allowDownload: !!row.allow_download,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    payoutPhone: row.payout_phone,
    payoutProvider: row.payout_provider,
    paystackRecipientCode: row.paystack_recipient_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Fields safe to return to any authenticated caller about ANY user — deliberately
// excludes passwordHash, contactEmail, contactPhone, payout details. Callers that
// need the full row (e.g. "it's me" or "I approved this payer") use toUser directly.
export function toPublicUser(user) {
  if (!user) return null;
  const { passwordHash, contactEmail, contactPhone, payoutPhone, payoutProvider, paystackRecipientCode, email, ...rest } = user;
  return rest;
}

export const usersRepo = {
  create({ email, handle, name, passwordHash }) {
    const id = newId("user");
    db.prepare(
      `INSERT INTO users (id, email, handle, name, password_hash) VALUES (?, ?, ?, ?, ?)`
    ).run(id, email.toLowerCase(), handle.toLowerCase(), name, passwordHash);
    return this.findById(id);
  },

  findById(id) {
    return toUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(id));
  },

  findByEmail(email) {
    return toUser(db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase()));
  },

  findByHandle(handle) {
    return toUser(db.prepare(`SELECT * FROM users WHERE handle = ?`).get(handle.toLowerCase()));
  },

  updateProfile(id, { name, bio, handle }) {
    db.prepare(
      `UPDATE users SET name = COALESCE(?, name), bio = COALESCE(?, bio), handle = COALESCE(?, handle), updated_at = datetime('now') WHERE id = ?`
    ).run(name ?? null, bio ?? null, handle ? handle.toLowerCase() : null, id);
    return this.findById(id);
  },

  updatePayoutDestination(id, { payoutPhone, payoutProvider, paystackRecipientCode }) {
    db.prepare(
      `UPDATE users SET payout_phone = ?, payout_provider = ?, paystack_recipient_code = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(payoutPhone, payoutProvider, paystackRecipientCode, id);
    return this.findById(id);
  },

  updateContactInfo(id, { contactEmail, contactPhone }) {
    db.prepare(
      `UPDATE users SET contact_email = ?, contact_phone = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(contactEmail, contactPhone, id);
    return this.findById(id);
  },

  updateBumEnabled(id, bumEnabled) {
    db.prepare(`UPDATE users SET bum_enabled = ?, updated_at = datetime('now') WHERE id = ?`).run(bumEnabled ? 1 : 0, id);
    return this.findById(id);
  },

  list({ limit = 50, offset = 0 } = {}) {
    return db.prepare(`SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset).map(toUser);
  },
};
