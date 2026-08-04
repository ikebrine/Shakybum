import { db } from "../db/index.js";
import { computeBadge, BUM_OK_BADGES_FOR_ELIGIBILITY } from "../lib/badges.js";
import { postsRepo, followsRepo } from "../repositories/social.js";
import { usersRepo } from "../repositories/users.js";
import { notificationsRepo } from "../repositories/misc.js";

/**
 * Recomputes and persists a user's badge from their real activity. Call
 * this after anything that changes moves-posted or follower count — see
 * call sites in routes/posts.routes.js and routes/follows.routes.js.
 *
 * If the recalculated badge drops below Live Bum-session eligibility,
 * bumEnabled is force-disabled — a creator shouldn't keep collecting
 * bookings on a badge tier they no longer hold. They're notified so it
 * doesn't look like a silent bug on their end.
 */
export async function recomputeBadge(userId) {
  const user = await usersRepo.findById(userId);
  if (!user) return null;

  const [movesCount, followersCount] = await Promise.all([
    postsRepo.countByUser(userId),
    followsRepo.followerCount(userId),
  ]);
  const newBadge = computeBadge({ movesCount, followersCount });

  if (newBadge === user.badge) return user;

  const wasEligible = BUM_OK_BADGES_FOR_ELIGIBILITY.includes(user.badge);
  const stillEligible = BUM_OK_BADGES_FOR_ELIGIBILITY.includes(newBadge);
  const shouldDisableBum = user.bumEnabled && wasEligible && !stillEligible;

  await db.query(
    `UPDATE users SET badge = $1, bum_enabled = $2, updated_at = now() WHERE id = $3`,
    [newBadge, shouldDisableBum ? false : user.bumEnabled, userId]
  );

  const leveledUp = badgeRank(newBadge) > badgeRank(user.badge);
  await notificationsRepo.create({
    userId,
    type: leveledUp ? "badge_up" : "badge_down",
    text: leveledUp
      ? `🎉 You leveled up to ${newBadge}!`
      : shouldDisableBum
        ? `Your badge dropped to ${newBadge} — Live Bum sessions have been turned off since they require Silver Queen or higher.`
        : `Your badge is now ${newBadge}.`,
  });

  return usersRepo.findById(userId);
}

const RANK = ["Newcomer", "RisingStar", "SilverQueen", "GoldQueen", "Platinum", "Diamond"];
function badgeRank(badge) {
  return RANK.indexOf(badge);
}
