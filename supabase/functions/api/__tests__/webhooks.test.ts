import assert from "node:assert/strict";
import { setupTestEnv, uniqueStamp } from "./helpers/testEnv.ts";

// autoSucceed: false — this suite manually fires webhook events so it can
// test the failure paths the happy-path suite (escrow.test.ts) doesn't reach.
const env = await setupTestEnv({ autoSucceed: false });

async function newUser(label: string) {
  const stamp = uniqueStamp();
  return env.signup({ email: `${label}${stamp}@test.com`, handle: `${label}${stamp}`.slice(0, 20), name: label });
}

Deno.test("webhook: invalid signature is rejected", async () => {
  const res = await fetch(`http://localhost:${env.appPort}/functions/v1/api/webhooks/paystack`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-paystack-signature": "not-a-real-signature" },
    body: JSON.stringify({ event: "charge.success", data: { reference: "fake" } }),
  });
  assert.equal(res.status, 401);
});

Deno.test("webhook: charge.success is idempotent — firing twice doesn't double-process", async () => {
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
  assert.equal(status2, 200);

  const cr = await env.api("GET", `/contact-requests/${initiate.body.contactRequest.id}`, { token: payer.token });
  assert.equal(cr.body.contactRequest.status, "paid_hold");
});

Deno.test("webhook: transfer.failed marks payout_failed and notifies the creator (not the payer)", async () => {
  const creator = await newUser("failpay_creator");
  const payer = await newUser("failpay_payer");
  await env.api("POST", "/users/me/payout-destination", { token: creator.token, body: { payoutPhone: "0551234567", payoutProvider: "vodafone" } });

  const initiate = await env.api("POST", "/contact-requests", {
    token: payer.token, body: { creatorHandle: creator.user.handle, phone: "0241234567", provider: "mtn" },
  });
  const crId = initiate.body.contactRequest.id;
  await env.fireWebhookEvent({ event: "charge.success", data: { reference: initiate.body.charge.reference, status: "success", amount: 500 } });

  const approve = await env.api("POST", `/contact-requests/${crId}/approve`, { token: creator.token });
  assert.equal(approve.body.contactRequest.status, "approved");

  const { getPaymentByRefId } = await import("./helpers/devTools.ts");
  const payment = await getPaymentByRefId(crId);
  assert.equal(payment!.status, "processing_payout");

  await env.fireWebhookEvent({ event: "transfer.failed", data: { reference: payment!.payoutReference, reason: "Insufficient balance" } });

  const failedPayment = await getPaymentByRefId(crId);
  assert.equal(failedPayment!.status, "payout_failed");

  const notifs = await env.api("GET", "/notifications", { token: creator.token });
  assert.ok(notifs.body.notifications.some((n: any) => n.type === "payout_issue"));
});

Deno.test("webhook: refund.processed confirms a declined request's refund", async () => {
  const creator = await newUser("refund_creator");
  const payer = await newUser("refund_payer");

  const initiate = await env.api("POST", "/contact-requests", {
    token: payer.token, body: { creatorHandle: creator.user.handle, phone: "0241234567", provider: "mtn" },
  });
  await env.fireWebhookEvent({ event: "charge.success", data: { reference: initiate.body.charge.reference, status: "success", amount: 500 } });

  await env.api("POST", `/contact-requests/${initiate.body.contactRequest.id}/decline`, { token: creator.token });

  const { getPaymentByRefId } = await import("./helpers/devTools.ts");
  const processing = await getPaymentByRefId(initiate.body.contactRequest.id);
  assert.equal(processing!.status, "processing_refund");

  await env.fireWebhookEvent({ event: "refund.processed", data: { transaction: { reference: processing!.paystackReference } } });

  const confirmed = await getPaymentByRefId(initiate.body.contactRequest.id);
  assert.equal(confirmed!.status, "refunded");
});

Deno.test({
  name: "teardown",
  fn: async () => { await env.teardown(); },
  sanitizeResources: false,
  sanitizeOps: false,
});
