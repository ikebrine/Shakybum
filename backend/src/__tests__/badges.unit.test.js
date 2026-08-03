import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBadge } from "../lib/badges.js";

test("computeBadge: requires BOTH moves and followers thresholds (AND, not OR)", () => {
  assert.equal(computeBadge({ movesCount: 0, followersCount: 0 }), "Newcomer");
  assert.equal(computeBadge({ movesCount: 100, followersCount: 0 }), "Newcomer"); // moves alone insufficient
  assert.equal(computeBadge({ movesCount: 0, followersCount: 10000 }), "Newcomer"); // followers alone insufficient
  assert.equal(computeBadge({ movesCount: 5, followersCount: 500 }), "SilverQueen"); // documented anchor point
  assert.equal(computeBadge({ movesCount: 4, followersCount: 500 }), "RisingStar"); // one below moves threshold
  assert.equal(computeBadge({ movesCount: 5, followersCount: 499 }), "RisingStar"); // one below followers threshold
});

test("computeBadge: all tiers reachable in order", () => {
  assert.equal(computeBadge({ movesCount: 3, followersCount: 100 }), "RisingStar");
  assert.equal(computeBadge({ movesCount: 15, followersCount: 1500 }), "GoldQueen");
  assert.equal(computeBadge({ movesCount: 25, followersCount: 3000 }), "Platinum");
  assert.equal(computeBadge({ movesCount: 40, followersCount: 6000 }), "Diamond");
});

test("computeBadge: picks the highest tier the user qualifies for, not the first match", () => {
  // Someone who's clearly Diamond-tier shouldn't get stuck at a lower badge
  assert.equal(computeBadge({ movesCount: 1000, followersCount: 100000 }), "Diamond");
});
