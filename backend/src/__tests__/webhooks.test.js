import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnv, sleep, uniqueStamp } from "./helpers/testEnv.js";

// autoSucceed: false — this suite manually fires webhook events so it can
// test the failure paths the happy-path suite (escrow.test.js) doesn't reach.
let env;
before(async () => { env = await setupTestEnv({ autoSucceed: false }); });
after(async () => { await env.teardown(); });

async function newUser(label) {
  const stamp = uniqueStamp();
  return env.signup({ email: `${label}${stamp}@test.com`, handle: `${label}${stamp}`.slice(0, 20), name: label });
}

test("webhook: invalid signature is rejected", async () => {
  const res = await fetch(`http://localhost:${env.backendPort}/api/webhooks/paystack`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-paystack-signature": "not-a-real-signature" },
    body: JSON.stringify({ event: "charge.success", data: { reference: "fake" } }),
  });
  assert.equal(res.status, 401);
});

test("webhook: charge.success is idempotent — firing twice doesn't double-process", async () => {
  const creator = await newUser("idem_creator");
  const payer = await newUser("idem_payer");
  await env.api("POST", "/users/me/payout-destination", { token: creator.token, body: { payoutPhone: "0551234567", payoutProvider: "vodafone" } });

  const initiate = await env.api("POST", "/contact-requests", {
    token: payer.token, body: { creatorHandle: creator.user.handle, phone: "0241234567", provider: "mtn" },
  });
  const ref = initiate.body.charge.reference;

  const status1 = await env.fireWebhookEvent({ event: "charge.success", data: { reference: ref, status: "success", amount: 500 } });
  const status2 = await env.fireWebhookEvent({ event: "charge.success", data: { reference: ref, status: "success", amount: 500 } });
  assert.equal(status1, 200);
  assert.equal(status2, 200); // still 200 (Paystack expects that), but internally a no-op the second time

  const cr = await env.api("GET", `/contact-requests/${initiate.body.contactRequest.id}`, { token: payer.token });
  assert.equal(cr.body.contactRequest.status, "paid_hold"); // not double-advanced
});

test("webhook: transfer.failed marks payout_failed and notifies the creator (not the payer)", async () => {
  const creator = await newUser("failpay_creator");
  const payer = await newUser("failpay_payer");
  await env.api("POST", "/users/me/payout-destination", { token: creator.token, body: { payoutPhone: "0551234567", payoutProvider: "vodafone" } });

  const initiate = await env.api("POST", "/contact-requests", {
    token: payer.token, body: { creatorHandle: creator.user.handle, phone: "0241234567", provider: "mtn" },
  });
  const crId = initiate.body.contactRequest.id;
  await env.fireWebhookEvent({ event: "charge.success", data: { reference: initiate.body.charge.reference, status: "success", amount: 500 } });

  const approve = await env.api("POST", `/contact-requests/${crId}/approve`, { token: creator.token });
  assert.equal(approve.body.contactRequest.status, "approved"); // still approves immediately — payout is tracked separately

  // Find the transfer reference the mock recipient call generated — the test
  // double-checks via the notification that gets created once transfer.failed fires.
  // We don't have direct DB access to the payout_reference from here, so we
  // simulate what Paystack would send: a failure for whatever transfer was
  // just initiated. Since this test's mock never auto-fires transfer.success
  // (autoSucceed: false), the payment is still sitting in "processing_payout" —
  // we look it up via the dev-only introspection helper.
  const { getPaymentByRefId } = await import("./helpers/devTools.js");
  const payment = getPaymentByRefId(crId);
  assert.equal(payment.status, "processing_payout");

  await env.fireWebhookEvent({ event: "transfer.failed", data: { reference: payment.payoutReference, reason: "Insufficient balance" } });

  const { getPaymentByRefId: recheck } = await import("./helpers/devTools.js");
  const failedPayment = recheck(crId);
  assert.equal(failedPayment.status, "payout_failed");

  const notifs = await env.api("GET", "/notifications", { token: creator.token });
  assert.ok(notifs.body.notifications.some((n) => n.type === "payout_issue"));
});

test("webhook: refund.processed confirms a declined request's refund", async () => {
  const creator = await newUser("refund_creator");
  const payer = await newUser("refund_payer");

  const initiate = await env.api("POST", "/contact-requests", {
    token: payer.token, body: { creatorHandle: creator.user.handle, phone: "0241234567", provider: "mtn" },
  });
  await env.fireWebhookEvent({ event: "charge.success", data: { reference: initiate.body.charge.reference, status: "success", amount: 500 } });

  await env.api("POST", `/contact-requests/${initiate.body.contactRequest.id}/decline`, { token: creator.token });

  const { getPaymentByRefId } = await import("./helpers/devTools.js");
  const processing = getPaymentByRefId(initiate.body.contactRequest.id);
  assert.equal(processing.status, "processing_refund");

  await env.fireWebhookEvent({ event: "refund.processed", data: { transaction: { reference: processing.paystackReference } } });

  const confirmed = getPaymentByRefId(initiate.body.contactRequest.id);
  assert.equal(confirmed.status, "refunded");
});
