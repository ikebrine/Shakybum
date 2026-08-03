// Dev/testing utility only. Badge is not currently computed from any
// activity (moves posted, followers, etc.) — that reputation/progression
// system is a known gap, see README "Known gaps". Until it exists, this is
// the only way to move a user into Silver Queen+ for testing Bum sessions.
//
// Usage: node scripts/dev-set-badge.js <handle> <badge>
//   node scripts/dev-set-badge.js amarabeats GoldQueen
import "dotenv/config";
import { usersRepo } from "../src/repositories/users.js";
import { db } from "../src/db/index.js";

const [, , handle, badge] = process.argv;
const VALID = ["Newcomer", "RisingStar", "SilverQueen", "GoldQueen", "Platinum", "Diamond"];

if (!handle || !VALID.includes(badge)) {
  console.error(`Usage: node scripts/dev-set-badge.js <handle> <badge>\nValid badges: ${VALID.join(", ")}`);
  process.exit(1);
}

const user = usersRepo.findByHandle(handle);
if (!user) {
  console.error(`No user with handle "${handle}"`);
  process.exit(1);
}

db.prepare(`UPDATE users SET badge = ? WHERE id = ?`).run(badge, user.id);
console.log(`${handle} is now ${badge}`);
