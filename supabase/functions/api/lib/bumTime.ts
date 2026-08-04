interface BumSessionLike {
  status: string;
  startedAt: string | Date | null;
  totalSec: number;
}

/**
 * Remaining seconds for a Bum session, computed on read rather than ticked
 * by a server-side timer/cron — matters even more here than on a
 * traditional server, since Edge Functions don't have a persistent
 * process to run a background timer in at all.
 */
export function remainingSecFor(session: BumSessionLike): number {
  if (session.status === "completed") return 0;
  if (!session.startedAt) return session.totalSec;
  const startedAt = typeof session.startedAt === "string"
    ? new Date(session.startedAt.includes("T") ? session.startedAt : session.startedAt.replace(" ", "T") + "Z")
    : session.startedAt;
  const elapsedSec = (Date.now() - startedAt.getTime()) / 1000;
  return Math.max(0, Math.round(session.totalSec - elapsedSec));
}

export function withRemainingSec<T extends BumSessionLike>(session: T): T & { remainingSec: number } {
  return { ...session, remainingSec: remainingSecFor(session) };
}
