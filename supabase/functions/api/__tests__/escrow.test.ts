import assert from "node:assert/strict";
import { setupTestEnv, sleep, uniqueStamp } from "./helpers/testEnv.ts";

const env = await setupTestEnv();

async function makeCreatorAndPayer() {
  const stamp = uniqueStamp();
  const creator = await env.signup({ email: `creator${stamp}@test.com`, handle: `creator${stamp}`.slice(0, 20), name: "Amara Osei" });
  const payer = await env.signup({ email: `payer${stamp}@test.com`, handle: `payer${stamp}`.slice(0, 20), name: "Kwame Boateng" });
  await env.api("POST", "/users/me/payout-destination", {
    token: creator.token, body: { payoutPhone: "0551234567", payoutProvider: "vodafone" },
  });
  return { creator, payer };
}

Deno.test("signup rejects contact info in username", async () => {
  const res = await env.api("POST", "/auth/signup", {
    body: { email: "bad@test.com", password: "password123", handle: "mywhatsapp247", name: "Bad Actor" },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /whatsapp/);
});

Deno.test("bio update blocked when it contains contact info", async () => {
  const { creator } = await makeCreatorAndPayer();
  const res = await env.api("PATCH", "/users/me", { token: creator.token, body: { bio: "DM me on telegram!" } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /telegram/);
});

Deno.test("contact request: full approve flow releases payout and reveals contact info", async () => {
  const { creator, payer } = await makeCreatorAndPayer();
  await env.api("PUT", "/users/me/contact-info", {
    token: creator.token, body: { contactEmail: "amara.real@example.com", contactPhone: "+233241111111" },
  });

  const initiate = await env.api("POST", "/contact-requests", {
    token: payer.token, body: { creatorHandle: creator.user.handle, phone: "0241234567", provider: "mtn" },
  });
  assert.equal(initiate.status, 201);
  const crId = initiate.body.contactRequest.id;

  await sleep(150);

  const afterWebhook = await env.api("GET", `/contact-requests/${crId}`, { token: payer.token });
  assert.equal(afterWebhook.body.contactRequest.status, "paid_hold");

  const approve = await env.api("POST", `/contact-requests/${crId}/approve`, { token: creator.token });
  assert.equal(approve.status, 200);
  assert.equal(approve.body.contactRequest.status, "approved");

  const revealed = await env.api("GET", `/contact-requests/${crId}`, { token: payer.token });
  assert.equal(revealed.body.contactRequest.creatorContact.email, "amara.real@example.com");
});

Deno.test("contact request: decline triggers refund, blocks double-decline", async () => {
  const { creator, payer } = await makeCreatorAndPayer();
  const initiate = await env.api("POST", "/contact-requests", {
    token: payer.token, body: { creatorHandle: creator.user.handle, phone: "0241234567", provider: "mtn" },
  });
  const crId = initiate.body.contactRequest.id;
  await sleep(150);

  const decline = await env.api("POST", `/contact-requests/${crId}/decline`, { token: creator.token });
  assert.equal(decline.body.contactRequest.status, "declined");

  const doubleDecline = await env.api("POST", `/contact-requests/${crId}/decline`, { token: creator.token });
  assert.equal(doubleDecline.status, 400);
});

Deno.test("authorization: payer cannot approve their own request, cannot self-request", async () => {
  const { creator, payer } = await makeCreatorAndPayer();
  const initiate = await env.api("POST", "/contact-requests", {
    token: payer.token, body: { creatorHandle: creator.user.handle, phone: "0241234567", provider: "mtn" },
  });
  const crId = initiate.body.contactRequest.id;

  const wrongApprove = await env.api("POST", `/contact-requests/${crId}/approve`, { token: payer.token });
  assert.equal(wrongApprove.status, 403);

  const selfRequest = await env.api("POST", "/contact-requests", {
    token: creator.token, body: { creatorHandle: creator.user.handle, phone: "0241234567", provider: "mtn" },
  });
  assert.equal(selfRequest.status, 400);
});

Deno.test("approval blocked until creator registers a payout destination", async () => {
  const stamp = uniqueStamp();
  const creator = await env.signup({ email: `nopay${stamp}@test.com`, handle: `nopay${stamp}`.slice(0, 20), name: "No Payout" });
  const payer = await env.signup({ email: `payer2${stamp}@test.com`, handle: `payer2${stamp}`.slice(0, 20), name: "Payer Two" });

  const initiate = await env.api("POST", "/contact-requests", {
    token: payer.token, body: { creatorHandle: creator.user.handle, phone: "0241234567", provider: "mtn" },
  });
  const crId = initiate.body.contactRequest.id;
  await sleep(150);

  const approve = await env.api("POST", `/contact-requests/${crId}/approve`, { token: creator.token });
  assert.equal(approve.status, 409);
});

Deno.test("chat: blocked before approval, unlocked after, still filters contact info", async () => {
  const { creator, payer } = await makeCreatorAndPayer();

  const blockedBefore = await env.api("POST", `/chat/${creator.user.id}/messages`, { token: payer.token, body: { text: "hi" } });
  assert.equal(blockedBefore.status, 403);

  const initiate = await env.api("POST", "/contact-requests", {
    token: payer.token, body: { creatorHandle: creator.user.handle, phone: "0241234567", provider: "mtn" },
  });
  await sleep(150);
  await env.api("POST", `/contact-requests/${initiate.body.contactRequest.id}/approve`, { token: creator.token });

  const okMsg = await env.api("POST", `/chat/${creator.user.id}/messages`, { token: payer.token, body: { text: "Hey! 💃" } });
  assert.equal(okMsg.status, 201);

  const leakMsg = await env.api("POST", `/chat/${creator.user.id}/messages`, {
    token: payer.token, body: { text: "call me on whatsapp 0241234567" },
  });
  assert.equal(leakMsg.status, 400);
});

Deno.test("Bum session: full lifecycle — book, approve, start, extend, end", async () => {
  const { creator, payer } = await makeCreatorAndPayer();
  const { setBadge } = await import("./helpers/devTools.ts");
  await setBadge(creator.user.handle, "SilverQueen");
  await env.api("PATCH", "/users/me/bum-settings", { token: creator.token, body: { bumEnabled: true } });

  const book = await env.api("POST", "/bum-sessions", {
    token: payer.token, body: { creatorHandle: creator.user.handle, mins: 15, phone: "0241234567", provider: "mtn" },
  });
  assert.equal(book.status, 201);
  assert.equal(book.body.bumSession.amount, 18);
  const bsId = book.body.bumSession.id;
  await sleep(150);

  const approve = await env.api("POST", `/bum-sessions/${bsId}/approve`, { token: creator.token });
  assert.equal(approve.body.bumSession.status, "approved");

  const start = await env.api("POST", `/bum-sessions/${bsId}/start`, { token: payer.token });
  assert.ok(start.body.bumSession.remainingSec >= 895 && start.body.bumSession.remainingSec <= 900,
    `expected ~900s remaining, got ${start.body.bumSession.remainingSec}`);

  const extend = await env.api("POST", `/bum-sessions/${bsId}/extend`, {
    token: payer.token, body: { phone: "0241234567", provider: "mtn" },
  });
  assert.equal(extend.status, 201);
  await sleep(150);

  const afterExtend = await env.api("GET", `/bum-sessions/${bsId}`, { token: payer.token });
  assert.equal(afterExtend.body.bumSession.extensions, 1);
  assert.ok(afterExtend.body.bumSession.remainingSec > 1700);

  const end = await env.api("POST", `/bum-sessions/${bsId}/end`, { token: payer.token });
  assert.equal(end.body.bumSession.status, "completed");
});

Deno.test({
  name: "teardown",
  fn: async () => { await env.teardown(); },
  sanitizeResources: false,
  sanitizeOps: false,
});
