/**
 * Badge thresholds. See the Node.js backend's src/lib/badges.js for the
 * full rationale — ported here unchanged. Anchor point: "Silver Queen
 * requires 5+ moves posted and 500+ followers" (from the frontend FAQ);
 * everything else extrapolated and documented as this backend's own policy.
 */
const THRESHOLDS = [
  { badge: "Diamond", moves: 40, followers: 6000 },
  { badge: "Platinum", moves: 25, followers: 3000 },
  { badge: "GoldQueen", moves: 15, followers: 1500 },
  { badge: "SilverQueen", moves: 5, followers: 500 },
  { badge: "RisingStar", moves: 3, followers: 100 },
  { badge: "Newcomer", moves: 0, followers: 0 },
];

export function computeBadge({ movesCount, followersCount }: { movesCount: number; followersCount: number }): string {
  for (const tier of THRESHOLDS) {
    if (movesCount >= tier.moves && followersCount >= tier.followers) return tier.badge;
  }
  return "Newcomer";
}

export const BUM_OK_BADGES_FOR_ELIGIBILITY = ["SilverQueen", "GoldQueen", "Platinum", "Diamond"];
