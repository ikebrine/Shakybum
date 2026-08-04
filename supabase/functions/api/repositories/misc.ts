import { db } from "../lib/db.ts";
import { newId } from "../lib/id.ts";

// ── Bum extensions ──
function toExtension(row: any) {
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
  async create({ bumSessionId, mins, amount, paystackReference }: { bumSessionId: string; mins: number; amount: number; paystackReference: string }) {
    const id = newId("bumext");
    await db.query(
      `INSERT INTO bum_extensions (id, bum_session_id, mins, amount, paystack_reference) VALUES ($1, $2, $3, $4, $5)`,
      [id, bumSessionId, mins, amount, paystackReference]
    );
    return this.findById(id);
  },
  async findById(id: string) {
    const { rows } = await db.query(`SELECT * FROM bum_extensions WHERE id = $1`, [id]);
    return toExtension(rows[0]);
  },
  async findByReference(ref: string) {
    const { rows } = await db.query(`SELECT * FROM bum_extensions WHERE paystack_reference = $1`, [ref]);
    return toExtension(rows[0]);
  },
  async setStatus(id: string, status: string) {
    await db.query(`UPDATE bum_extensions SET status = $1 WHERE id = $2`, [status, id]);
    return this.findById(id);
  },
};

// ── Messages ──
export const chatKeyFor = (a: string, b: string) => [a, b].sort().join(":");

function toMessage(row: any) {
  if (!row) return null;
  return { id: row.id, senderId: row.sender_id, chatKey: row.chat_key, text: row.text, createdAt: row.created_at };
}
export const messagesRepo = {
  async create({ senderId, otherUserId, text }: { senderId: string; otherUserId: string; text: string }) {
    const id = newId("msg");
    const chatKey = chatKeyFor(senderId, otherUserId);
    const { rows } = await db.query(
      `INSERT INTO messages (id, sender_id, chat_key, text) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, senderId, chatKey, text]
    );
    return toMessage(rows[0]);
  },
  async listBetween(userA: string, userB: string, { limit = 100 }: { limit?: number } = {}) {
    const chatKey = chatKeyFor(userA, userB);
    const { rows } = await db.query(
      `SELECT * FROM messages WHERE chat_key = $1 ORDER BY created_at ASC LIMIT $2`,
      [chatKey, limit]
    );
    return rows.map(toMessage);
  },
};

// ── Notifications ──
function toNotif(row: any) {
  if (!row) return null;
  return { id: row.id, userId: row.user_id, type: row.type, text: row.text, read: !!row.read, createdAt: row.created_at };
}
export const notificationsRepo = {
  async create({ userId, type, text }: { userId: string; type: string; text: string }) {
    const id = newId("notif");
    const { rows } = await db.query(
      `INSERT INTO notifications (id, user_id, type, text) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, userId, type, text]
    );
    return toNotif(rows[0]);
  },
  async listFor(userId: string, { limit = 50 }: { limit?: number } = {}) {
    const { rows } = await db.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return rows.map(toNotif);
  },
  async markRead(id: string, userId: string) {
    await db.query(`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`, [id, userId]);
  },
};

// ── Payments (central ledger) ──
function toPayment(row: any) {
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
  async create(opts: { userId: string; kind: string; refId: string; amount: number; platformCut: number; creatorCut: number; paystackReference: string }) {
    const { userId, kind, refId, amount, platformCut, creatorCut, paystackReference } = opts;
    const id = newId("pay");
    const { rows } = await db.query(
      `INSERT INTO payments (id, user_id, kind, ref_id, amount, platform_cut, creator_cut, paystack_reference) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, userId, kind, refId, amount, platformCut, creatorCut, paystackReference]
    );
    return toPayment(rows[0]);
  },
  async findById(id: string) {
    const { rows } = await db.query(`SELECT * FROM payments WHERE id = $1`, [id]);
    return toPayment(rows[0]);
  },
  async findByReference(ref: string) {
    const { rows } = await db.query(`SELECT * FROM payments WHERE paystack_reference = $1`, [ref]);
    return toPayment(rows[0]);
  },
  async setStatus(id: string, status: string) {
    await db.query(`UPDATE payments SET status = $1, updated_at = now() WHERE id = $2`, [status, id]);
    return this.findById(id);
  },
  async setPayoutReference(id: string, payoutReference: string) {
    await db.query(
      `UPDATE payments SET payout_reference = $1, status = 'processing_payout', updated_at = now() WHERE id = $2`,
      [payoutReference, id]
    );
    return this.findById(id);
  },
  async setRefundReference(id: string, refundReference: string) {
    await db.query(
      `UPDATE payments SET refund_reference = $1, status = 'processing_refund', updated_at = now() WHERE id = $2`,
      [refundReference, id]
    );
    return this.findById(id);
  },
  async findByPayoutReference(ref: string) {
    const { rows } = await db.query(`SELECT * FROM payments WHERE payout_reference = $1`, [ref]);
    return toPayment(rows[0]);
  },
  async ledgerFor(userId: string) {
    const { rows } = await db.query(`SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return rows.map(toPayment);
  },
};
