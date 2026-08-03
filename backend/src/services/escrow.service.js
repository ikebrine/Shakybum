import { newId } from "../lib/id.js";
import { initiateMomoCharge, createTransferRecipient, initiateTransfer, refundTransaction } from "../lib/paystack.js";
import { priceForContact, priceForBum, creatorCut, platformFee, BUM_EXTEND_MIN } from "../lib/pricing.js";
import { contactRequestsRepo } from "../repositories/contactRequests.js";
import { bumSessionsRepo } from "../repositories/bumSessions.js";
import { bumExtensionsRepo, paymentsRepo, notificationsRepo } from "../repositories/misc.js";
import { usersRepo } from "../repositories/users.js";

class EscrowError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── Initiate payments (payer side) ──

export async function initiateContactPayment({ payer, creator, phone, provider }) {
  if (payer.id === creator.id) throw new EscrowError("Can't request your own contact");
  const amount = priceForContact(creator.badge);
  const reference = newId("pstk_contact");

  const contactRequest = contactRequestsRepo.create({ payerId: payer.id, creatorId: creator.id, amount, paystackReference: reference });
  const payment = paymentsRepo.create({
    userId: payer.id, kind: "contact", refId: contactRequest.id,
    amount, platformCut: platformFee(amount), creatorCut: creatorCut(amount), paystackReference: reference,
  });

  try {
    const charge = await initiateMomoCharge({
      email: payer.email, amountGHS: amount, phone, provider, reference,
      metadata: { kind: "contact", contactRequestId: contactRequest.id },
    });
    return { contactRequest, charge };
  } catch (err) {
    // Charge never actually started — don't leave the request stuck in
    // "pending" forever, since nothing will ever webhook back to resolve it.
    contactRequestsRepo.setStatus(contactRequest.id, "expired");
    paymentsRepo.setStatus(payment.id, "failed");
    throw err;
  }
}

export async function initiateBumPayment({ payer, creator, mins, phone, provider }) {
  if (payer.id === creator.id) throw new EscrowError("Can't book your own session");
  const amount = priceForBum(creator.badge, mins);
  const reference = newId("pstk_bum");

  const bumSession = bumSessionsRepo.create({ payerId: payer.id, creatorId: creator.id, mins, amount, paystackReference: reference });
  const payment = paymentsRepo.create({
    userId: payer.id, kind: "bum", refId: bumSession.id,
    amount, platformCut: platformFee(amount), creatorCut: creatorCut(amount), paystackReference: reference,
  });

  try {
    const charge = await initiateMomoCharge({
      email: payer.email, amountGHS: amount, phone, provider, reference,
      metadata: { kind: "bum", bumSessionId: bumSession.id },
    });
    return { bumSession, charge };
  } catch (err) {
    bumSessionsRepo.setStatus(bumSession.id, "expired");
    paymentsRepo.setStatus(payment.id, "failed");
    throw err;
  }
}

export async function initiateBumExtension({ bumSession, payer, phone, provider }) {
  if (!["approved", "active"].includes(bumSession.status)) {
    throw new EscrowError("Session must be confirmed and running to extend");
  }
  const creator = usersRepo.findById(bumSession.creatorId);
  const amount = priceForBum(creator.badge, BUM_EXTEND_MIN);
  const reference = newId("pstk_ext");

  const extension = bumExtensionsRepo.create({ bumSessionId: bumSession.id, mins: BUM_EXTEND_MIN, amount, paystackReference: reference });
  const payment = paymentsRepo.create({
    userId: payer.id, kind: "bum_extend", refId: extension.id,
    amount, platformCut: platformFee(amount), creatorCut: creatorCut(amount), paystackReference: reference,
  });

  try {
    const charge = await initiateMomoCharge({
      email: payer.email, amountGHS: amount, phone, provider, reference,
      metadata: { kind: "bum_extend", bumExtensionId: extension.id, bumSessionId: bumSession.id },
    });
    return { extension, charge };
  } catch (err) {
    bumExtensionsRepo.setStatus(extension.id, "failed");
    paymentsRepo.setStatus(payment.id, "failed");
    throw err;
  }
}

// ── Webhook confirmation (Paystack calls this indirectly via routes/payments.js) ──

/**
 * Called once a `charge.success` webhook is verified. Idempotent — if the
 * payment is already marked paid, this is a no-op (Paystack can and does
 * retry webhook delivery).
 */
export async function handleChargeSuccess(reference) {
  const payment = paymentsRepo.findByReference(reference);
  if (!payment) return { handled: false, reason: "no matching payment" };
  if (payment.status !== "initiated") return { handled: false, reason: `already ${payment.status}` };

  paymentsRepo.setStatus(payment.id, "paid");

  if (payment.kind === "contact") {
    const cr = contactRequestsRepo.setStatus(payment.refId, "paid_hold");
    notificationsRepo.create({
      userId: cr.creatorId, type: "contact_request",
      text: `New paid contact request — GHS ${payment.amount.toFixed(2)} held in escrow. Approve or decline in Contact Requests.`,
    });
    return { handled: true, kind: "contact", contactRequest: cr };
  }

  if (payment.kind === "bum") {
    const bs = bumSessionsRepo.setStatus(payment.refId, "paid_hold");
    notificationsRepo.create({
      userId: bs.creatorId, type: "bum_request",
      text: `New Live Bum session request (${bs.mins} min) — GHS ${payment.amount.toFixed(2)} held in escrow.`,
    });
    return { handled: true, kind: "bum", bumSession: bs };
  }

  if (payment.kind === "bum_extend") {
    // Extensions are instant (the creator already agreed by confirming the base
    // session) — no approval hold, apply immediately and release the payout now.
    const ext = bumExtensionsRepo.setStatus(payment.refId, "paid");
    const session = bumSessionsRepo.extend(ext.bumSessionId, ext.mins * 60);
    await releaseCreatorPayout({ creator: usersRepo.findById(session.creatorId), payment });
    notificationsRepo.create({
      userId: session.payerId, type: "bum_extended",
      text: `+${ext.mins} min added to your session.`,
    });
    return { handled: true, kind: "bum_extend", bumSession: session };
  }

  return { handled: false, reason: "unknown payment kind" };
}

// ── Approve / decline (creator side) ──

async function releaseCreatorPayout({ creator, payment }) {
  if (!creator.paystackRecipientCode) {
    // Don't silently swallow this — a creator without a registered payout
    // destination should block on approval, not lose the payout.
    throw new EscrowError(
      "Creator has no payout method registered — register a payout MoMo number (POST /api/users/me/payout-destination) before approving requests.",
      409
    );
  }
  const transferRef = newId("pstk_payout");
  await initiateTransfer({
    recipientCode: creator.paystackRecipientCode,
    amountGHS: payment.creatorCut,
    reason: `Shakybum payout — ${payment.kind}`,
    reference: transferRef,
  });
  // Paystack accepting the transfer request means it's IN PROGRESS, not
  // settled — actual completion is confirmed asynchronously via the
  // transfer.success/transfer.failed webhook (see routes/payments.routes.js).
  // The domain object (contact request / Live Bum session) still flips to
  // "approved" right away for UX — reversing that after the fact would be
  // worse than the alternative, so a failed transfer becomes a flagged
  // reconciliation case (see handleTransferFailed) rather than an undo.
  paymentsRepo.setPayoutReference(payment.id, transferRef);
}

export async function approveContactRequest({ contactRequestId, actingUser }) {
  const cr = contactRequestsRepo.findById(contactRequestId);
  if (!cr) throw new EscrowError("Contact request not found", 404);
  if (cr.creatorId !== actingUser.id) throw new EscrowError("Not your request to approve", 403);
  if (cr.status !== "paid_hold") throw new EscrowError(`Cannot approve a request in status '${cr.status}'`);

  const payment = paymentsRepo.findByReference(cr.paystackReference);
  await releaseCreatorPayout({ creator: actingUser, payment });
  const updated = contactRequestsRepo.setStatus(contactRequestId, "approved");

  notificationsRepo.create({ userId: cr.payerId, type: "contact_approved", text: `${actingUser.name} approved your contact request!` });
  return updated;
}

export async function declineContactRequest({ contactRequestId, actingUser }) {
  const cr = contactRequestsRepo.findById(contactRequestId);
  if (!cr) throw new EscrowError("Contact request not found", 404);
  if (cr.creatorId !== actingUser.id) throw new EscrowError("Not your request to decline", 403);
  if (cr.status !== "paid_hold") throw new EscrowError(`Cannot decline a request in status '${cr.status}'`);

  await refundTransaction({ reference: cr.paystackReference, reason: "Contact request declined" });
  const payment = paymentsRepo.findByReference(cr.paystackReference);
  // Accepted by Paystack != settled — see releaseCreatorPayout for the same
  // pattern on the payout side. Confirmed via refund.processed webhook.
  paymentsRepo.setRefundReference(payment.id, cr.paystackReference);
  const updated = contactRequestsRepo.setStatus(contactRequestId, "declined");

  notificationsRepo.create({ userId: cr.payerId, type: "contact_declined", text: `Your contact request was declined and refunded.` });
  return updated;
}

export async function approveBumSession({ bumSessionId, actingUser }) {
  const bs = bumSessionsRepo.findById(bumSessionId);
  if (!bs) throw new EscrowError("Live Bum session not found", 404);
  if (bs.creatorId !== actingUser.id) throw new EscrowError("Not your session to approve", 403);
  if (bs.status !== "paid_hold") throw new EscrowError(`Cannot approve a session in status '${bs.status}'`);

  const payment = paymentsRepo.findByReference(bs.paystackReference);
  await releaseCreatorPayout({ creator: actingUser, payment });
  const updated = bumSessionsRepo.setStatus(bumSessionId, "approved");

  notificationsRepo.create({ userId: bs.payerId, type: "bum_approved", text: `${actingUser.name} confirmed your ${bs.mins}-min Live Bum session!` });
  return updated;
}

export async function declineBumSession({ bumSessionId, actingUser }) {
  const bs = bumSessionsRepo.findById(bumSessionId);
  if (!bs) throw new EscrowError("Live Bum session not found", 404);
  if (bs.creatorId !== actingUser.id) throw new EscrowError("Not your session to decline", 403);
  if (bs.status !== "paid_hold") throw new EscrowError(`Cannot decline a session in status '${bs.status}'`);

  await refundTransaction({ reference: bs.paystackReference, reason: "Live Bum session declined" });
  const payment = paymentsRepo.findByReference(bs.paystackReference);
  paymentsRepo.setRefundReference(payment.id, bs.paystackReference);
  const updated = bumSessionsRepo.setStatus(bumSessionId, "declined");

  notificationsRepo.create({ userId: bs.payerId, type: "bum_declined", text: `Your Live Bum session request was declined and refunded.` });
  return updated;
}

export async function startBumSession({ bumSessionId, actingUser }) {
  const bs = bumSessionsRepo.findById(bumSessionId);
  if (!bs) throw new EscrowError("Live Bum session not found", 404);
  if (![bs.payerId, bs.creatorId].includes(actingUser.id)) throw new EscrowError("Not a participant in this session", 403);
  if (bs.status !== "approved") throw new EscrowError(`Cannot start a session in status '${bs.status}'`);
  return bumSessionsRepo.start(bumSessionId);
}

export async function endBumSession({ bumSessionId, actingUser }) {
  const bs = bumSessionsRepo.findById(bumSessionId);
  if (!bs) throw new EscrowError("Live Bum session not found", 404);
  if (![bs.payerId, bs.creatorId].includes(actingUser.id)) throw new EscrowError("Not a participant in this session", 403);
  if (bs.status !== "active") throw new EscrowError(`Cannot end a session in status '${bs.status}'`);
  return bumSessionsRepo.end(bumSessionId);
}

export { EscrowError };

// ── Async payout/refund confirmation (transfer.success/failed, refund.processed webhooks) ──
//
// NOTE on Paystack event shapes: these are implemented against Paystack's
// documented webhook payloads as of this backend's writing, but weren't
// verified against a live account (this dev environment can't reach
// api.paystack.co — see README). Check your Paystack dashboard's webhook
// event log against the field paths below before relying on this in
// production; `data.reference` / `data.transaction.reference` are the
// fields most likely to have shifted if Paystack's API has changed.

export async function handleTransferSuccess(reference) {
  const payment = paymentsRepo.findByPayoutReference(reference);
  if (!payment) return { handled: false, reason: "no matching payout" };
  if (payment.status !== "processing_payout") return { handled: false, reason: `already ${payment.status}` };

  paymentsRepo.setStatus(payment.id, "released");
  return { handled: true };
}

export async function handleTransferFailed(reference, failureReason) {
  const payment = paymentsRepo.findByPayoutReference(reference);
  if (!payment) return { handled: false, reason: "no matching payout" };
  if (payment.status !== "processing_payout") return { handled: false, reason: `already ${payment.status}` };

  paymentsRepo.setStatus(payment.id, "payout_failed");

  // payment.userId is the PAYER — the payout that failed belongs to the
  // CREATOR, so look that up via the underlying domain object instead.
  let creatorId = null;
  if (payment.kind === "contact") creatorId = contactRequestsRepo.findById(payment.refId)?.creatorId;
  else if (payment.kind === "bum") creatorId = bumSessionsRepo.findById(payment.refId)?.creatorId;
  else if (payment.kind === "bum_extend") {
    const ext = bumExtensionsRepo.findById(payment.refId);
    creatorId = ext ? bumSessionsRepo.findById(ext.bumSessionId)?.creatorId : null;
  }

  // The contact/Live Bum session was already marked "approved" and the payer
  // already saw the result (contact info revealed / session confirmed) —
  // reversing that would be worse than the alternative. This is now a
  // financial reconciliation case: the creator is owed money the platform
  // failed to deliver. Flagging both sides rather than pretending it didn't happen.
  if (creatorId) {
    notificationsRepo.create({
      userId: creatorId,
      type: "payout_issue",
      text: `A payout to you (GHS ${payment.creatorCut.toFixed(2)}) failed (${failureReason || "unknown reason"}) — our team has been notified and will resolve this.`,
    });
  }
  console.error(`[PAYOUT FAILED] payment ${payment.id} (${payment.kind}, ref ${payment.refId}) — creator ${creatorId} payout of GHS ${payment.creatorCut} did not complete. Needs manual resolution.`);
  return { handled: true };
}

export async function handleRefundProcessed(transactionReference) {
  const payment = paymentsRepo.findByReference(transactionReference);
  if (!payment) return { handled: false, reason: "no matching payment" };
  if (payment.status !== "processing_refund") return { handled: false, reason: `already ${payment.status}` };

  paymentsRepo.setStatus(payment.id, "refunded");
  return { handled: true };
}
