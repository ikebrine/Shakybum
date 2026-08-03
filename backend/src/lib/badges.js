/**
 * Badge thresholds. The frontend (shakybum-app/src/App.jsx) never encoded a
 * formal formula — its mock users just have hardcoded badges — except for
 * one documented data point in the FAQ: "Silver Queen requires 5+ moves
 * posted and 500+ followers." Everything else here is this backend's own
 * extrapolation from that anchor, kept internally consistent. Treat this as
 * a policy decision to revisit, not a value ported from an authoritative source.
 *
 * A badge requires BOTH thresholds (moves AND followers) — matches the "5+
 * moves posted and 500+ followers" phrasing (an "and", not an "or").
 */
const THRESHOLDS = [
  { badge: "Diamond", moves: 40, followers: 6000 },
  { badge: "Platinum", moves: 25, followers: 3000 },
  { badge: "GoldQueen", moves: 15, followers: 1500 },
  { badge: "SilverQueen", moves: 5, followers: 500 },
  { badge: "RisingStar", moves: 3, followers: 100 },
  { badge: "Newcomer", moves: 0, followers: 0 },
];

export function computeBadge({ movesCount, followersCount }) {
  for (const tier of THRESHOLDS) {
    if (movesCount >= tier.moves && followersCount >= tier.followers) return tier.badge;
  }
  return "Newcomer";
}

export const BUM_OK_BADGES_FOR_ELIGIBILITY = ["SilverQueen", "GoldQueen", "Platinum", "Diamond"];
