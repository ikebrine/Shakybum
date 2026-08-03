import { db } from "../db/index.js";
import { computeBadge, BUM_OK_BADGES_FOR_ELIGIBILITY } from "../lib/badges.js";
import { postsRepo } from "../repositories/social.js";
import { followsRepo } from "../repositories/social.js";
import { usersRepo } from "../repositories/users.js";
import { notificationsRepo } from "../repositories/misc.js";

/**
 * Recomputes and persists a user's badge from their real activity. Call
 * this after anything that changes moves-posted or follower count — see
 * call sites in routes/posts.routes.js and routes/follows.routes.js.
 *
 * If the recalculated badge drops below Bum-session eligibility, bumEnabled
 * is force-disabled — a creator shouldn't keep collecting Bum bookings on a
 * badge tier they no longer hold. They're notified so it doesn't look like
 * a silent bug on their end.
 */
export function recomputeBadge(userId) {
  const user = usersRepo.findById(userId);
  if (!user) return null;

  const movesCount = postsRepo.countByUser(userId);
  const followersCount = followsRepo.followerCount(userId);
  const newBadge = computeBadge({ movesCount, followersCount });

  if (newBadge === user.badge) return user;

  const wasEligible = BUM_OK_BADGES_FOR_ELIGIBILITY.includes(user.badge);
  const stillEligible = BUM_OK_BADGES_FOR_ELIGIBILITY.includes(newBadge);
  const shouldDisableBum = user.bumEnabled && wasEligible && !stillEligible;

  db.prepare(`UPDATE users SET badge = ?, bum_enabled = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(newBadge, shouldDisableBum ? 0 : (user.bumEnabled ? 1 : 0), userId);

  const leveledUp = badgeRank(newBadge) > badgeRank(user.badge);
  notificationsRepo.create({
    userId,
    type: leveledUp ? "badge_up" : "badge_down",
    text: leveledUp
      ? `🎉 You leveled up to ${newBadge}!`
      : shouldDisableBum
        ? `Your badge dropped to ${newBadge} — Bum sessions have been turned off since they require Silver Queen or higher.`
        : `Your badge is now ${newBadge}.`,
  });

  return usersRepo.findById(userId);
}

const RANK = ["Newcomer", "RisingStar", "SilverQueen", "GoldQueen", "Platinum", "Diamond"];
function badgeRank(badge) {
  return RANK.indexOf(badge);
}
