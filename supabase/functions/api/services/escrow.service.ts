import { newId } from "../lib/id.ts";
import { initiateMomoCharge, createTransferRecipient, initiateTransfer, refundTransaction } from "../lib/paystack.ts";
import { priceForContact, priceForBum, creatorCut, platformFee, BUM_EXTEND_MIN } from "../lib/pricing.ts";
import { contactRequestsRepo } from "../repositories/contactRequests.ts";
import { bumSessionsRepo } from "../repositories/bumSessions.ts";
import { bumExtensionsRepo, paymentsRepo, notificationsRepo } from "../repositories/misc.ts";
import { usersRepo } from "../repositories/users.ts";

export class EscrowError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── Initiate payments (payer side) ──

export async function initiateContactPayment({ payer, creator, phone, provider }: { payer: any; creator: any; phone: string; provider: string }) {
  if (payer.id === creator.id) throw new EscrowError("Can't request your own contact");
  const amount = priceForContact(creator.badge);
  const reference = newId("pstk_contact");

  const contactRequest = await contactRequestsRepo.create({ payerId: payer.id, creatorId: creator.id, amount, paystackReference: reference });
  const payment = await paymentsRepo.create({
    userId: payer.id, kind: "contact", refId: contactRequest!.id,
    amount, platformCut: platformFee(amount), creatorCut: creatorCut(amount), paystackReference: reference,
  });

  try {
    const charge = await initiateMomoCharge({
      email: payer.email, amountGHS: amount, phone, provider, reference,
      metadata: { kind: "contact", contactRequestId: contactRequest!.id },
    });
    return { contactRequest, charge };
  } catch (err) {
    await contactRequestsRepo.setStatus(contactRequest!.id, "expired");
    await paymentsRepo.setStatus(payment!.id, "failed");
    throw err;
  }
}

export async function initiateBumPayment({ payer, creator, mins, phone, provider }: { payer: any; creator: any; mins: number; phone: string; provider: string }) {
  if (payer.id === creator.id) throw new EscrowError("Can't book your own session");
  const amount = priceForBum(creator.badge, mins);
  const reference = newId("pstk_bum");

  const bumSession = await bumSessionsRepo.create({ payerId: payer.id, creatorId: creator.id, mins, amount, paystackReference: reference });
  const payment = await paymentsRepo.create({
    userId: payer.id, kind: "bum", refId: bumSession!.id,
    amount, platformCut: platformFee(amount), creatorCut: creatorCut(amount), paystackReference: reference,
  });

  try {
    const charge = await initiateMomoCharge({
      email: payer.email, amountGHS: amount, phone, provider, reference,
      metadata: { kind: "bum", bumSessionId: bumSession!.id },
    });
    return { bumSession, charge };
  } catch (err) {
    await bumSessionsRepo.setStatus(bumSession!.id, "expired");
    await paymentsRepo.setStatus(payment!.id, "failed");
    throw err;
  }
}

export async function initiateBumExtension({ bumSession, payer, phone, provider }: { bumSession: any; payer: any; phone: string; provider: string }) {
  if (!["approved", "active"].includes(bumSession.status)) {
    throw new EscrowError("Session must be confirmed and running to extend");
  }
  const creator = await usersRepo.findById(bumSession.creatorId);
  const amount = priceForBum(creator!.badge, BUM_EXTEND_MIN);
  const reference = newId("pstk_ext");

  const extension = await bumExtensionsRepo.create({ bumSessionId: bumSession.id, mins: BUM_EXTEND_MIN, amount, paystackReference: reference });
  const payment = await paymentsRepo.create({
    userId: payer.id, kind: "bum_extend", refId: extension!.id,
    amount, platformCut: platformFee(amount), creatorCut: creatorCut(amount), paystackReference: reference,
  });

  try {
    const charge = await initiateMomoCharge({
      email: payer.email, amountGHS: amount, phone, provider, reference,
      metadata: { kind: "bum_extend", bumExtensionId: extension!.id, bumSessionId: bumSession.id },
    });
    return { extension, charge };
  } catch (err) {
    await bumExtensionsRepo.setStatus(extension!.id, "failed");
    await paymentsRepo.setStatus(payment!.id, "failed");
    throw err;
  }
}

// ── Webhook confirmation ──

export async function handleChargeSuccess(reference: string) {
  const payment = await paymentsRepo.findByReference(reference);
  if (!payment) return { handled: false, reason: "no matching payment" };
  if (payment.status !== "initiated") return { handled: false, reason: `already ${payment.status}` };

  await paymentsRepo.setStatus(payment.id, "paid");

  if (payment.kind === "contact") {
    const cr = await contactRequestsRepo.setStatus(payment.refId, "paid_hold");
    await notificationsRepo.create({
      userId: cr!.creatorId, type: "contact_request",
      text: `New paid contact request — GHS ${payment.amount.toFixed(2)} held in escrow. Approve or decline in Contact Requests.`,
    });
    return { handled: true, kind: "contact", contactRequest: cr };
  }

  if (payment.kind === "bum") {
    const bs = await bumSessionsRepo.setStatus(payment.refId, "paid_hold");
    await notificationsRepo.create({
      userId: bs!.creatorId, type: "bum_request",
      text: `New Live Bum session request (${bs!.mins} min) — GHS ${payment.amount.toFixed(2)} held in escrow.`,
    });
    return { handled: true, kind: "bum", bumSession: bs };
  }

  if (payment.kind === "bum_extend") {
    const ext = await bumExtensionsRepo.setStatus(payment.refId, "paid");
    const session = await bumSessionsRepo.extend(ext!.bumSessionId, ext!.mins * 60);
    const creator = await usersRepo.findById(session!.creatorId);
    await releaseCreatorPayout({ creator, payment });
    await notificationsRepo.create({
      userId: session!.payerId, type: "bum_extended",
      text: `+${ext!.mins} min added to your session.`,
    });
    return { handled: true, kind: "bum_extend", bumSession: session };
  }

  return { handled: false, reason: "unknown payment kind" };
}

// ── Approve / decline ──

async function releaseCreatorPayout({ creator, payment }: { creator: any; payment: any }) {
  if (!creator.paystackRecipientCode) {
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
  await paymentsRepo.setPayoutReference(payment.id, transferRef);
}

export async function approveContactRequest({ contactRequestId, actingUser }: { contactRequestId: string; actingUser: any }) {
  const cr = await contactRequestsRepo.findById(contactRequestId);
  if (!cr) throw new EscrowError("Contact request not found", 404);
  if (cr.creatorId !== actingUser.id) throw new EscrowError("Not your request to approve", 403);
  if (cr.status !== "paid_hold") throw new EscrowError(`Cannot approve a request in status '${cr.status}'`);

  const payment = await paymentsRepo.findByReference(cr.paystackReference);
  await releaseCreatorPayout({ creator: actingUser, payment });
  const updated = await contactRequestsRepo.setStatus(contactRequestId, "approved");

  await notificationsRepo.create({ userId: cr.payerId, type: "contact_approved", text: `${actingUser.name} approved your contact request!` });
  return updated;
}

export async function declineContactRequest({ contactRequestId, actingUser }: { contactRequestId: string; actingUser: any }) {
  const cr = await contactRequestsRepo.findById(contactRequestId);
  if (!cr) throw new EscrowError("Contact request not found", 404);
  if (cr.creatorId !== actingUser.id) throw new EscrowError("Not your request to decline", 403);
  if (cr.status !== "paid_hold") throw new EscrowError(`Cannot decline a request in status '${cr.status}'`);

  await refundTransaction({ reference: cr.paystackReference, reason: "Contact request declined" });
  const payment = await paymentsRepo.findByReference(cr.paystackReference);
  await paymentsRepo.setRefundReference(payment!.id, cr.paystackReference);
  const updated = await contactRequestsRepo.setStatus(contactRequestId, "declined");

  await notificationsRepo.create({ userId: cr.payerId, type: "contact_declined", text: `Your contact request was declined and refunded.` });
  return updated;
}

export async function approveBumSession({ bumSessionId, actingUser }: { bumSessionId: string; actingUser: any }) {
  const bs = await bumSessionsRepo.findById(bumSessionId);
  if (!bs) throw new EscrowError("Live Bum session not found", 404);
  if (bs.creatorId !== actingUser.id) throw new EscrowError("Not your session to approve", 403);
  if (bs.status !== "paid_hold") throw new EscrowError(`Cannot approve a session in status '${bs.status}'`);

  const payment = await paymentsRepo.findByReference(bs.paystackReference);
  await releaseCreatorPayout({ creator: actingUser, payment });
  const updated = await bumSessionsRepo.setStatus(bumSessionId, "approved");

  await notificationsRepo.create({ userId: bs.payerId, type: "bum_approved", text: `${actingUser.name} confirmed your ${bs.mins}-min Live Bum session!` });
  return updated;
}

export async function declineBumSession({ bumSessionId, actingUser }: { bumSessionId: string; actingUser: any }) {
  const bs = await bumSessionsRepo.findById(bumSessionId);
  if (!bs) throw new EscrowError("Live Bum session not found", 404);
  if (bs.creatorId !== actingUser.id) throw new EscrowError("Not your session to decline", 403);
  if (bs.status !== "paid_hold") throw new EscrowError(`Cannot decline a session in status '${bs.status}'`);

  await refundTransaction({ reference: bs.paystackReference, reason: "Live Bum session declined" });
  const payment = await paymentsRepo.findByReference(bs.paystackReference);
  await paymentsRepo.setRefundReference(payment!.id, bs.paystackReference);
  const updated = await bumSessionsRepo.setStatus(bumSessionId, "declined");

  await notificationsRepo.create({ userId: bs.payerId, type: "bum_declined", text: `Your Live Bum session request was declined and refunded.` });
  return updated;
}

export async function startBumSession({ bumSessionId, actingUser }: { bumSessionId: string; actingUser: any }) {
  const bs = await bumSessionsRepo.findById(bumSessionId);
  if (!bs) throw new EscrowError("Live Bum session not found", 404);
  if (![bs.payerId, bs.creatorId].includes(actingUser.id)) throw new EscrowError("Not a participant in this session", 403);
  if (bs.status !== "approved") throw new EscrowError(`Cannot start a session in status '${bs.status}'`);
  return bumSessionsRepo.start(bumSessionId);
}

export async function endBumSession({ bumSessionId, actingUser }: { bumSessionId: string; actingUser: any }) {
  const bs = await bumSessionsRepo.findById(bumSessionId);
  if (!bs) throw new EscrowError("Live Bum session not found", 404);
  if (![bs.payerId, bs.creatorId].includes(actingUser.id)) throw new EscrowError("Not a participant in this session", 403);
  if (bs.status !== "active") throw new EscrowError(`Cannot end a session in status '${bs.status}'`);
  return bumSessionsRepo.end(bumSessionId);
}

// ── Async payout/refund confirmation (transfer.success/failed, refund.processed webhooks) ──
//
// NOTE on Paystack event shapes: implemented against Paystack's documented
// webhook payloads, not verified against a live account (this dev sandbox
// can't reach api.paystack.co). Check your Paystack dashboard's webhook
// event log against the field paths below before relying on this in
// production.

export async function handleTransferSuccess(reference: string) {
  const payment = await paymentsRepo.findByPayoutReference(reference);
  if (!payment) return { handled: false, reason: "no matching payout" };
  if (payment.status !== "processing_payout") return { handled: false, reason: `already ${payment.status}` };

  await paymentsRepo.setStatus(payment.id, "released");
  return { handled: true };
}

export async function handleTransferFailed(reference: string, failureReason?: string) {
  const payment = await paymentsRepo.findByPayoutReference(reference);
  if (!payment) return { handled: false, reason: "no matching payout" };
  if (payment.status !== "processing_payout") return { handled: false, reason: `already ${payment.status}` };

  await paymentsRepo.setStatus(payment.id, "payout_failed");

  let creatorId: string | null = null;
  if (payment.kind === "contact") {
    const cr = await contactRequestsRepo.findById(payment.refId);
    creatorId = cr?.creatorId ?? null;
  } else if (payment.kind === "bum") {
    const bs = await bumSessionsRepo.findById(payment.refId);
    creatorId = bs?.creatorId ?? null;
  } else if (payment.kind === "bum_extend") {
    const ext = await bumExtensionsRepo.findById(payment.refId);
    if (ext) {
      const bs = await bumSessionsRepo.findById(ext.bumSessionId);
      creatorId = bs?.creatorId ?? null;
    }
  }

  if (creatorId) {
    await notificationsRepo.create({
      userId: creatorId,
      type: "payout_issue",
      text: `A payout to you (GHS ${payment.creatorCut.toFixed(2)}) failed (${failureReason || "unknown reason"}) — our team has been notified and will resolve this.`,
    });
  }
  console.error(`[PAYOUT FAILED] payment ${payment.id} (${payment.kind}, ref ${payment.refId}) — creator ${creatorId} payout of GHS ${payment.creatorCut} did not complete. Needs manual resolution.`);
  return { handled: true };
}

export async function handleRefundProcessed(transactionReference: string) {
  const payment = await paymentsRepo.findByReference(transactionReference);
  if (!payment) return { handled: false, reason: "no matching payment" };
  if (payment.status !== "processing_refund") return { handled: false, reason: `already ${payment.status}` };

  await paymentsRepo.setStatus(payment.id, "refunded");
  return { handled: true };
}
