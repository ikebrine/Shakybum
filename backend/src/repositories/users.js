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
  async create({ email, handle, name, passwordHash }) {
    const id = newId("user");
    await db.query(
      `INSERT INTO users (id, email, handle, name, password_hash) VALUES ($1, $2, $3, $4, $5)`,
      [id, email.toLowerCase(), handle.toLowerCase(), name, passwordHash]
    );
    return this.findById(id);
  },

  async findById(id) {
    const { rows } = await db.query(`SELECT * FROM users WHERE id = $1`, [id]);
    return toUser(rows[0]);
  },

  async findByEmail(email) {
    const { rows } = await db.query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);
    return toUser(rows[0]);
  },

  async findByHandle(handle) {
    const { rows } = await db.query(`SELECT * FROM users WHERE handle = $1`, [handle.toLowerCase()]);
    return toUser(rows[0]);
  },

  async updateProfile(id, { name, bio, handle }) {
    await db.query(
      `UPDATE users SET name = COALESCE($1, name), bio = COALESCE($2, bio), handle = COALESCE($3, handle), updated_at = now() WHERE id = $4`,
      [name ?? null, bio ?? null, handle ? handle.toLowerCase() : null, id]
    );
    return this.findById(id);
  },

  async updatePayoutDestination(id, { payoutPhone, payoutProvider, paystackRecipientCode }) {
    await db.query(
      `UPDATE users SET payout_phone = $1, payout_provider = $2, paystack_recipient_code = $3, updated_at = now() WHERE id = $4`,
      [payoutPhone, payoutProvider, paystackRecipientCode, id]
    );
    return this.findById(id);
  },

  async updateContactInfo(id, { contactEmail, contactPhone }) {
    await db.query(
      `UPDATE users SET contact_email = $1, contact_phone = $2, updated_at = now() WHERE id = $3`,
      [contactEmail, contactPhone, id]
    );
    return this.findById(id);
  },

  async updateBumEnabled(id, bumEnabled) {
    await db.query(`UPDATE users SET bum_enabled = $1, updated_at = now() WHERE id = $2`, [!!bumEnabled, id]);
    return this.findById(id);
  },

  async list({ limit = 50, offset = 0 } = {}) {
    const { rows } = await db.query(`SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    return rows.map(toUser);
  },
};
