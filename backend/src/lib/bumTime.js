/**
 * Remaining seconds for a Bum session, computed on read rather than ticked by
 * a server-side timer/cron. totalSec grows by BUM_EXTEND_MIN*60 on each paid
 * extension (see repositories/bumSessions.js `extend`).
 */
export function remainingSecFor(session) {
  if (session.status === "completed") return 0;
  if (!session.startedAt) return session.totalSec; // not started yet — full time still available
  const elapsedSec = (Date.now() - new Date(session.startedAt.replace(" ", "T") + "Z").getTime()) / 1000;
  return Math.max(0, Math.round(session.totalSec - elapsedSec));
}

export function withRemainingSec(session) {
  return { ...session, remainingSec: remainingSecFor(session) };
}
