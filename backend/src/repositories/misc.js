import { db } from "../db/index.js";
import { newId } from "../lib/id.js";

// ── Bum extensions ──
function toExtension(row) {
  if (!row) return null;
  return {
    id: row.id,
    bumSessionId: row.bum_session_id,
    mins: row.mins,
    amount: row.amount,
    paystackReference: row.paystack_reference,
    status: row.status,
    createdAt: row.created_at,
  };
}
export const bumExtensionsRepo = {
  create({ bumSessionId, mins, amount, paystackReference }) {
    const id = newId("bumext");
    db.prepare(
      `INSERT INTO bum_extensions (id, bum_session_id, mins, amount, paystack_reference) VALUES (?, ?, ?, ?, ?)`
    ).run(id, bumSessionId, mins, amount, paystackReference);
    return this.findById(id);
  },
  findById(id) {
    return toExtension(db.prepare(`SELECT * FROM bum_extensions WHERE id = ?`).get(id));
  },
  findByReference(ref) {
    return toExtension(db.prepare(`SELECT * FROM bum_extensions WHERE paystack_reference = ?`).get(ref));
  },
  setStatus(id, status) {
    db.prepare(`UPDATE bum_extensions SET status = ? WHERE id = ?`).run(status, id);
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
  create({ senderId, otherUserId, text }) {
    const id = newId("msg");
    const chatKey = chatKeyFor(senderId, otherUserId);
    db.prepare(`INSERT INTO messages (id, sender_id, chat_key, text) VALUES (?, ?, ?, ?)`).run(id, senderId, chatKey, text);
    return toMessage(db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id));
  },
  listBetween(userA, userB, { limit = 100 } = {}) {
    const chatKey = chatKeyFor(userA, userB);
    return db.prepare(`SELECT * FROM messages WHERE chat_key = ? ORDER BY created_at ASC LIMIT ?`).all(chatKey, limit).map(toMessage);
  },
};

// ── Notifications ──
function toNotif(row) {
  if (!row) return null;
  return { id: row.id, userId: row.user_id, type: row.type, text: row.text, read: !!row.read, createdAt: row.created_at };
}
export const notificationsRepo = {
  create({ userId, type, text }) {
    const id = newId("notif");
    db.prepare(`INSERT INTO notifications (id, user_id, type, text) VALUES (?, ?, ?, ?)`).run(id, userId, type, text);
    return toNotif(db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(id));
  },
  listFor(userId, { limit = 50 } = {}) {
    return db.prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).all(userId, limit).map(toNotif);
  },
  markRead(id, userId) {
    db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`).run(id, userId);
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
    amount: row.amount,
    platformCut: row.platform_cut,
    creatorCut: row.creator_cut,
    status: row.status,
    paystackReference: row.paystack_reference,
    payoutReference: row.payout_reference,
    refundReference: row.refund_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export const paymentsRepo = {
  create({ userId, kind, refId, amount, platformCut, creatorCut, paystackReference }) {
    const id = newId("pay");
    db.prepare(
      `INSERT INTO payments (id, user_id, kind, ref_id, amount, platform_cut, creator_cut, paystack_reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, kind, refId, amount, platformCut, creatorCut, paystackReference);
    return this.findById(id);
  },
  findById(id) {
    return toPayment(db.prepare(`SELECT * FROM payments WHERE id = ?`).get(id));
  },
  findByReference(ref) {
    return toPayment(db.prepare(`SELECT * FROM payments WHERE paystack_reference = ?`).get(ref));
  },
  setStatus(id, status) {
    db.prepare(`UPDATE payments SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
    return this.findById(id);
  },
  setPayoutReference(id, payoutReference) {
    db.prepare(`UPDATE payments SET payout_reference = ?, status = 'processing_payout', updated_at = datetime('now') WHERE id = ?`).run(payoutReference, id);
    return this.findById(id);
  },
  setRefundReference(id, refundReference) {
    db.prepare(`UPDATE payments SET refund_reference = ?, status = 'processing_refund', updated_at = datetime('now') WHERE id = ?`).run(refundReference, id);
    return this.findById(id);
  },
  findByPayoutReference(ref) {
    return toPayment(db.prepare(`SELECT * FROM payments WHERE payout_reference = ?`).get(ref));
  },
  ledgerFor(userId) {
    return db.prepare(`SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC`).all(userId).map(toPayment);
  },
};
