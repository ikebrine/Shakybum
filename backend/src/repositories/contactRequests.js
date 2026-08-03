import { db } from "../db/index.js";
import { newId } from "../lib/id.js";

function toRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    payerId: row.payer_id,
    creatorId: row.creator_id,
    amount: row.amount,
    status: row.status,
    paystackReference: row.paystack_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const contactRequestsRepo = {
  create({ payerId, creatorId, amount, paystackReference }) {
    const id = newId("creq");
    db.prepare(
      `INSERT INTO contact_requests (id, payer_id, creator_id, amount, paystack_reference) VALUES (?, ?, ?, ?, ?)`
    ).run(id, payerId, creatorId, amount, paystackReference);
    return this.findById(id);
  },
  findById(id) {
    return toRow(db.prepare(`SELECT * FROM contact_requests WHERE id = ?`).get(id));
  },
  findByReference(ref) {
    return toRow(db.prepare(`SELECT * FROM contact_requests WHERE paystack_reference = ?`).get(ref));
  },
  setStatus(id, status) {
    db.prepare(`UPDATE contact_requests SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
    return this.findById(id);
  },
  receivedFor(creatorId, status = "paid_hold") {
    return db.prepare(`SELECT * FROM contact_requests WHERE creator_id = ? AND status = ? ORDER BY created_at DESC`).all(creatorId, status).map(toRow);
  },
  sentBy(payerId) {
    return db.prepare(`SELECT * FROM contact_requests WHERE payer_id = ? ORDER BY created_at DESC`).all(payerId).map(toRow);
  },
  isApprovedBetween(payerId, creatorId) {
    const row = db.prepare(
      `SELECT 1 FROM contact_requests WHERE payer_id = ? AND creator_id = ? AND status = 'approved' LIMIT 1`
    ).get(payerId, creatorId);
    return !!row;
  },
};
