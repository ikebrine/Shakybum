// Test-only helpers — direct DB access for setup/introspection that would
// otherwise be slow (bulk signups through bcrypt) or impossible (reading
// internal payment state) via the public API alone.
import { db } from "../../db/index.js";
import { usersRepo } from "../../repositories/users.js";
import { newId } from "../../lib/id.js";

// Mirrors scripts/dev-set-badge.js as an importable function — badge is not
// computed from anything self-servable yet outside recomputeBadge (see
// README "Known gaps"), so tests that need a specific starting badge use this.
export function setBadge(handle, badge) {
  const user = usersRepo.findByHandle(handle);
  if (!user) throw new Error(`No user with handle "${handle}"`);
  db.prepare(`UPDATE users SET badge = ? WHERE id = ?`).run(badge, user.id);
}

// Bypasses signup (bcrypt at cost-12 makes hundreds of real signups too slow
// for a test) — inserts synthetic follower rows directly for badge-threshold
// tests that need realistic follower COUNTS, not realistic follower accounts.
export function bulkFollow(followeeId, count) {
  const insertUser = db.prepare(`INSERT INTO users (id, email, handle, name, password_hash) VALUES (?, ?, ?, ?, 'unused')`);
  const insertFollow = db.prepare(`INSERT INTO follows (id, follower_id, followee_id) VALUES (?, ?, ?)`);
  const tx = db.transaction((n) => {
    for (let i = 0; i < n; i++) {
      const uid = newId("synth");
      insertUser.run(uid, `synth_${uid}@test.local`, `synth_${uid}`.slice(0, 20), "Synthetic Follower");
      insertFollow.run(newId("flw"), uid, followeeId);
    }
  });
  tx(count);
}

// Payments repo already exists but its lookups need a specific key — this is
// the "look up by domain object id" shape the webhook tests need for introspection.
export function getPaymentByRefId(refId) {
  const row = db.prepare(`SELECT * FROM payments WHERE ref_id = ?`).get(refId);
  if (!row) return null;
  return {
    id: row.id, userId: row.user_id, kind: row.kind, refId: row.ref_id, amount: row.amount,
    platformCut: row.platform_cut, creatorCut: row.creator_cut, status: row.status,
    paystackReference: row.paystack_reference, payoutReference: row.payout_reference,
    refundReference: row.refund_reference, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
