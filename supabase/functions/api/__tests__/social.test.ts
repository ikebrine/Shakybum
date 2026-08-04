import assert from "node:assert/strict";
import { setupTestEnv, uniqueStamp } from "./helpers/testEnv.ts";

const env = await setupTestEnv();

async function newUser(label: string) {
  const stamp = uniqueStamp();
  return env.signup({ email: `${label}${stamp}@test.com`, handle: `${label}${stamp}`.slice(0, 20), name: label });
}

Deno.test("posts: create, feed, like, comment", async () => {
  const alice = await newUser("alice");
  const bob = await newUser("bob");

  const create = await env.api("POST", "/posts", {
    token: alice.token, body: { caption: "Waist wine tutorial 💃", moveTag: "azonto", kind: "post" },
  });
  assert.equal(create.status, 201);
  const postId = create.body.post.id;

  const feed = await env.api("GET", "/posts?kind=post", { token: bob.token });
  assert.ok(feed.body.posts.some((p: any) => p.id === postId));

  const like = await env.api("POST", `/posts/${postId}/like`, { token: bob.token });
  assert.equal(like.body.post.likesCount, 1);

  const likeAgain = await env.api("POST", `/posts/${postId}/like`, { token: bob.token });
  assert.equal(likeAgain.body.post.likesCount, 1);

  const unlike = await env.api("DELETE", `/posts/${postId}/like`, { token: bob.token });
  assert.equal(unlike.body.post.likesCount, 0);

  const comment = await env.api("POST", `/posts/${postId}/comments`, { token: bob.token, body: { text: "Fire! 🔥" } });
  assert.equal(comment.status, 201);
});

Deno.test("posts: caption and comments are blocked when they leak contact info", async () => {
  const alice = await newUser("alice2");
  const bob = await newUser("bob2");

  const badCaption = await env.api("POST", "/posts", { token: alice.token, body: { caption: "call me on whatsapp 0241234567" } });
  assert.equal(badCaption.status, 400);

  const post = await env.api("POST", "/posts", { token: alice.token, body: { caption: "clean caption" } });
  const badComment = await env.api("POST", `/posts/${post.body.post.id}/comments`, { token: bob.token, body: { text: "ig: bob.dances" } });
  assert.equal(badComment.status, 400);
});

Deno.test("follows: follow/unfollow updates follower count, is idempotent", async () => {
  const alice = await newUser("alice3");
  const bob = await newUser("bob3");

  const follow = await env.api("POST", `/users/${bob.user.id}/follow`, { token: alice.token });
  assert.equal(follow.body.followerCount, 1);

  const followAgain = await env.api("POST", `/users/${bob.user.id}/follow`, { token: alice.token });
  assert.equal(followAgain.body.followerCount, 1);

  const cantFollowSelf = await env.api("POST", `/users/${alice.user.id}/follow`, { token: alice.token });
  assert.equal(cantFollowSelf.status, 400);

  const unfollow = await env.api("DELETE", `/users/${bob.user.id}/follow`, { token: alice.token });
  assert.equal(unfollow.body.followerCount, 0);
});

Deno.test("badge: auto-computes from moves posted + followers, gated correctly (AND not OR)", async () => {
  const creator = await newUser("rising");
  const { bulkFollow } = await import("./helpers/devTools.ts");
  const { recomputeBadge } = await import("../services/badge.service.ts");

  let me = (await env.api("GET", "/auth/me", { token: creator.token })).body.user;
  assert.equal(me.badge, "Newcomer");

  for (let i = 0; i < 5; i++) {
    await env.api("POST", "/posts", { token: creator.token, body: { caption: `move ${i}` } });
  }
  me = (await env.api("GET", "/auth/me", { token: creator.token })).body.user;
  assert.notEqual(me.badge, "SilverQueen");

  await bulkFollow(creator.user.id, 500);
  await recomputeBadge(creator.user.id);

  me = (await env.api("GET", "/auth/me", { token: creator.token })).body.user;
  assert.equal(me.badge, "SilverQueen");
});

Deno.test("badge: dropping below eligibility auto-disables bumEnabled", async () => {
  const creator = await newUser("dropper");
  const { setBadge } = await import("./helpers/devTools.ts");
  await setBadge(creator.user.handle, "SilverQueen");
  const enable = await env.api("PATCH", "/users/me/bum-settings", { token: creator.token, body: { bumEnabled: true } });
  assert.equal(enable.body.user.bumEnabled, true);

  const someone = await newUser("trigger");
  await env.api("POST", `/users/${creator.user.id}/follow`, { token: someone.token });
  await env.api("DELETE", `/users/${creator.user.id}/follow`, { token: someone.token });

  const me = (await env.api("GET", "/auth/me", { token: creator.token })).body.user;
  assert.equal(me.badge, "Newcomer");
  assert.equal(me.bumEnabled, false);
});

Deno.test("Bum-session opt-in is rejected below Silver Queen", async () => {
  const newcomer = await newUser("newbie");
  const res = await env.api("PATCH", "/users/me/bum-settings", { token: newcomer.token, body: { bumEnabled: true } });
  assert.equal(res.status, 403);
});

Deno.test({
  name: "teardown",
  fn: async () => { await env.teardown(); },
  sanitizeResources: false,
  sanitizeOps: false,
});
