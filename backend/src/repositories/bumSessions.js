import { db } from "../db/index.js";
import { newId } from "../lib/id.js";

function toRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    payerId: row.payer_id,
    creatorId: row.creator_id,
    mins: row.mins,
    amount: row.amount,
    status: row.status,
    paystackReference: row.paystack_reference,
    totalSec: row.total_sec,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    extensions: row.extensions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const bumSessionsRepo = {
  create({ payerId, creatorId, mins, amount, paystackReference }) {
    const id = newId("bum");
    db.prepare(
      `INSERT INTO bum_sessions (id, payer_id, creator_id, mins, amount, paystack_reference, total_sec) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, payerId, creatorId, mins, amount, paystackReference, mins * 60);
    return this.findById(id);
  },
  findById(id) {
    return toRow(db.prepare(`SELECT * FROM bum_sessions WHERE id = ?`).get(id));
  },
  findByReference(ref) {
    return toRow(db.prepare(`SELECT * FROM bum_sessions WHERE paystack_reference = ?`).get(ref));
  },
  setStatus(id, status) {
    db.prepare(`UPDATE bum_sessions SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
    return this.findById(id);
  },
  start(id) {
    db.prepare(`UPDATE bum_sessions SET status = 'active', started_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(id);
    return this.findById(id);
  },
  extend(id, extraSec) {
    db.prepare(
      `UPDATE bum_sessions SET total_sec = total_sec + ?, extensions = extensions + 1, updated_at = datetime('now') WHERE id = ?`
    ).run(extraSec, id);
    return this.findById(id);
  },
  end(id) {
    db.prepare(`UPDATE bum_sessions SET status = 'completed', ended_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(id);
    return this.findById(id);
  },
  receivedFor(creatorId, status = "paid_hold") {
    return db.prepare(`SELECT * FROM bum_sessions WHERE creator_id = ? AND status = ? ORDER BY created_at DESC`).all(creatorId, status).map(toRow);
  },
  sentBy(payerId) {
    return db.prepare(`SELECT * FROM bum_sessions WHERE payer_id = ? ORDER BY created_at DESC`).all(payerId).map(toRow);
  },
  activeOrApprovedFor(userId) {
    return db.prepare(
      `SELECT * FROM bum_sessions WHERE (payer_id = ? OR creator_id = ?) AND status IN ('approved','active') ORDER BY created_at DESC`
    ).all(userId, userId).map(toRow);
  },
};
