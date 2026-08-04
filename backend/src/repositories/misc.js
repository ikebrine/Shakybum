import { db } from "../db/index.js";
import { newId } from "../lib/id.js";

// ── Bum extensions ──
function toExtension(row) {
  if (!row) return null;
  return {
    id: row.id,
    bumSessionId: row.bum_session_id,
    mins: row.mins,
    amount: Number(row.amount),
    paystackReference: row.paystack_reference,
    status: row.status,
    createdAt: row.created_at,
  };
}
export const bumExtensionsRepo = {
  async create({ bumSessionId, mins, amount, paystackReference }) {
    const id = newId("bumext");
    await db.query(
      `INSERT INTO bum_extensions (id, bum_session_id, mins, amount, paystack_reference) VALUES ($1, $2, $3, $4, $5)`,
      [id, bumSessionId, mins, amount, paystackReference]
    );
    return this.findById(id);
  },
  async findById(id) {
    const { rows } = await db.query(`SELECT * FROM bum_extensions WHERE id = $1`, [id]);
    return toExtension(rows[0]);
  },
  async findByReference(ref) {
    const { rows } = await db.query(`SELECT * FROM bum_extensions WHERE paystack_reference = $1`, [ref]);
    return toExtension(rows[0]);
  },
  async setStatus(id, status) {
    await db.query(`UPDATE bum_extensions SET status = $1 WHERE id = $2`, [status, id]);
    return this.findById(id);
  },
};

// ── Messages ──
// Chat is keyed by the two participant IDs sorted lexicographically so a
// single conversation always maps to one chat_key regardless of who sent
// the last message.
export const chatKeyFor = (a, b) => [a, b].sort().join(":");

function toMessage(row) {
  if (!row) return null;
  return { id: row.id, senderId: row.sender_id, chatKey: row.chat_key, text: row.text, createdAt: row.created_at };
}
export const messagesRepo = {
  async create({ senderId, otherUserId, text }) {
    const id = newId("msg");
    const chatKey = chatKeyFor(senderId, otherUserId);
    const { rows } = await db.query(
      `INSERT INTO messages (id, sender_id, chat_key, text) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, senderId, chatKey, text]
    );
    return toMessage(rows[0]);
  },
  async listBetween(userA, userB, { limit = 100 } = {}) {
    const chatKey = chatKeyFor(userA, userB);
    const { rows } = await db.query(
      `SELECT * FROM messages WHERE chat_key = $1 ORDER BY created_at ASC LIMIT $2`,
      [chatKey, limit]
    );
    return rows.map(toMessage);
  },
};

// ── Notifications ──
function toNotif(row) {
  if (!row) return null;
  return { id: row.id, userId: row.user_id, type: row.type, text: row.text, read: !!row.read, createdAt: row.created_at };
}
export const notificationsRepo = {
  async create({ userId, type, text }) {
    const id = newId("notif");
    const { rows } = await db.query(
      `INSERT INTO notifications (id, user_id, type, text) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, userId, type, text]
    );
    return toNotif(rows[0]);
  },
  async listFor(userId, { limit = 50 } = {}) {
    const { rows } = await db.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return rows.map(toNotif);
  },
  async markRead(id, userId) {
    await db.query(`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`, [id, userId]);
  },
};

// ── Payments (central ledger) ──
function toPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    refId: row.ref_id,
    amount: Number(row.amount),
    platformCut: Number(row.platform_cut),
    creatorCut: Number(row.creator_cut),
    status: row.status,
    paystackReference: row.paystack_reference,
    payoutReference: row.payout_reference,
    refundReference: row.refund_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export const paymentsRepo = {
  async create({ userId, kind, refId, amount, platformCut, creatorCut, paystackReference }) {
    const id = newId("pay");
    const { rows } = await db.query(
      `INSERT INTO payments (id, user_id, kind, ref_id, amount, platform_cut, creator_cut, paystack_reference) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, userId, kind, refId, amount, platformCut, creatorCut, paystackReference]
    );
    return toPayment(rows[0]);
  },
  async findById(id) {
    const { rows } = await db.query(`SELECT * FROM payments WHERE id = $1`, [id]);
    return toPayment(rows[0]);
  },
  async findByReference(ref) {
    const { rows } = await db.query(`SELECT * FROM payments WHERE paystack_reference = $1`, [ref]);
    return toPayment(rows[0]);
  },
  async setStatus(id, status) {
    await db.query(`UPDATE payments SET status = $1, updated_at = now() WHERE id = $2`, [status, id]);
    return this.findById(id);
  },
  async setPayoutReference(id, payoutReference) {
    await db.query(
      `UPDATE payments SET payout_reference = $1, status = 'processing_payout', updated_at = now() WHERE id = $2`,
      [payoutReference, id]
    );
    return this.findById(id);
  },
  async setRefundReference(id, refundReference) {
    await db.query(
      `UPDATE payments SET refund_reference = $1, status = 'processing_refund', updated_at = now() WHERE id = $2`,
      [refundReference, id]
    );
    return this.findById(id);
  },
  async findByPayoutReference(ref) {
    const { rows } = await db.query(`SELECT * FROM payments WHERE payout_reference = $1`, [ref]);
    return toPayment(rows[0]);
  },
  async ledgerFor(userId) {
    const { rows } = await db.query(`SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return rows.map(toPayment);
  },
};
