import { db } from "../db/index.js";
import { newId } from "../lib/id.js";

function toRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    payerId: row.payer_id,
    creatorId: row.creator_id,
    mins: row.mins,
    amount: Number(row.amount),
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
  async create({ payerId, creatorId, mins, amount, paystackReference }) {
    const id = newId("bum");
    await db.query(
      `INSERT INTO bum_sessions (id, payer_id, creator_id, mins, amount, paystack_reference, total_sec) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, payerId, creatorId, mins, amount, paystackReference, mins * 60]
    );
    return this.findById(id);
  },
  async findById(id) {
    const { rows } = await db.query(`SELECT * FROM bum_sessions WHERE id = $1`, [id]);
    return toRow(rows[0]);
  },
  async findByReference(ref) {
    const { rows } = await db.query(`SELECT * FROM bum_sessions WHERE paystack_reference = $1`, [ref]);
    return toRow(rows[0]);
  },
  async setStatus(id, status) {
    await db.query(`UPDATE bum_sessions SET status = $1, updated_at = now() WHERE id = $2`, [status, id]);
    return this.findById(id);
  },
  async start(id) {
    await db.query(`UPDATE bum_sessions SET status = 'active', started_at = now(), updated_at = now() WHERE id = $1`, [id]);
    return this.findById(id);
  },
  async extend(id, extraSec) {
    await db.query(
      `UPDATE bum_sessions SET total_sec = total_sec + $1, extensions = extensions + 1, updated_at = now() WHERE id = $2`,
      [extraSec, id]
    );
    return this.findById(id);
  },
  async end(id) {
    await db.query(`UPDATE bum_sessions SET status = 'completed', ended_at = now(), updated_at = now() WHERE id = $1`, [id]);
    return this.findById(id);
  },
  async receivedFor(creatorId, status = "paid_hold") {
    const { rows } = await db.query(
      `SELECT * FROM bum_sessions WHERE creator_id = $1 AND status = $2 ORDER BY created_at DESC`,
      [creatorId, status]
    );
    return rows.map(toRow);
  },
  async sentBy(payerId) {
    const { rows } = await db.query(`SELECT * FROM bum_sessions WHERE payer_id = $1 ORDER BY created_at DESC`, [payerId]);
    return rows.map(toRow);
  },
  async activeOrApprovedFor(userId) {
    const { rows } = await db.query(
      `SELECT * FROM bum_sessions WHERE (payer_id = $1 OR creator_id = $1) AND status IN ('approved','active') ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(toRow);
  },
};
