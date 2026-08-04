import { db } from "../db/index.js";
import { newId } from "../lib/id.js";

function toRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    payerId: row.payer_id,
    creatorId: row.creator_id,
    amount: Number(row.amount),
    status: row.status,
    paystackReference: row.paystack_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const contactRequestsRepo = {
  async create({ payerId, creatorId, amount, paystackReference }) {
    const id = newId("creq");
    await db.query(
      `INSERT INTO contact_requests (id, payer_id, creator_id, amount, paystack_reference) VALUES ($1, $2, $3, $4, $5)`,
      [id, payerId, creatorId, amount, paystackReference]
    );
    return this.findById(id);
  },
  async findById(id) {
    const { rows } = await db.query(`SELECT * FROM contact_requests WHERE id = $1`, [id]);
    return toRow(rows[0]);
  },
  async findByReference(ref) {
    const { rows } = await db.query(`SELECT * FROM contact_requests WHERE paystack_reference = $1`, [ref]);
    return toRow(rows[0]);
  },
  async setStatus(id, status) {
    await db.query(`UPDATE contact_requests SET status = $1, updated_at = now() WHERE id = $2`, [status, id]);
    return this.findById(id);
  },
  async receivedFor(creatorId, status = "paid_hold") {
    const { rows } = await db.query(
      `SELECT * FROM contact_requests WHERE creator_id = $1 AND status = $2 ORDER BY created_at DESC`,
      [creatorId, status]
    );
    return rows.map(toRow);
  },
  async sentBy(payerId) {
    const { rows } = await db.query(`SELECT * FROM contact_requests WHERE payer_id = $1 ORDER BY created_at DESC`, [payerId]);
    return rows.map(toRow);
  },
  async isApprovedBetween(payerId, creatorId) {
    const { rows } = await db.query(
      `SELECT 1 FROM contact_requests WHERE payer_id = $1 AND creator_id = $2 AND status = 'approved' LIMIT 1`,
      [payerId, creatorId]
    );
    return rows.length > 0;
  },
};
