// Test-only helpers — direct DB access for setup/introspection that would
// otherwise be slow (bulk signups through bcrypt) or impossible (reading
// internal payment state) via the public API alone.
import { db, pool } from "../../db/index.js";
import { usersRepo } from "../../repositories/users.js";
import { newId } from "../../lib/id.js";

// Mirrors scripts/dev-set-badge.js as an importable function — badge is not
// computed from anything self-servable yet outside recomputeBadge (see
// README "Known gaps"), so tests that need a specific starting badge use this.
export async function setBadge(handle, badge) {
  const user = await usersRepo.findByHandle(handle);
  if (!user) throw new Error(`No user with handle "${handle}"`);
  await db.query(`UPDATE users SET badge = $1 WHERE id = $2`, [badge, user.id]);
}

// Bypasses signup (bcrypt at cost-12 makes hundreds of real signups too slow
// for a test) — inserts synthetic follower rows directly for badge-threshold
// tests that need realistic follower COUNTS, not realistic follower accounts.
// Runs as one Postgres transaction (client checkout + BEGIN/COMMIT) rather
// than `count` separate round-trips, both for speed and so a failure partway
// through can't leave a half-populated follower set behind.
export async function bulkFollow(followeeId, count) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < count; i++) {
      const uid = newId("synth");
      await client.query(
        `INSERT INTO users (id, email, handle, name, password_hash) VALUES ($1, $2, $3, $4, 'unused')`,
        [uid, `synth_${uid}@test.local`, `synth_${uid}`.slice(0, 20), "Synthetic Follower"]
      );
      await client.query(
        `INSERT INTO follows (id, follower_id, followee_id) VALUES ($1, $2, $3)`,
        [newId("flw"), uid, followeeId]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Payments repo already exists but its lookups need a specific key — this is
// the "look up by domain object id" shape the webhook tests need for introspection.
export async function getPaymentByRefId(refId) {
  const { rows } = await db.query(`SELECT * FROM payments WHERE ref_id = $1`, [refId]);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id, userId: row.user_id, kind: row.kind, refId: row.ref_id, amount: Number(row.amount),
    platformCut: Number(row.platform_cut), creatorCut: Number(row.creator_cut), status: row.status,
    paystackReference: row.paystack_reference, payoutReference: row.payout_reference,
    refundReference: row.refund_reference, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
