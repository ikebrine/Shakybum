// Mirrors CONTACT_PRICE / BUM_RATE_PER_MIN in the frontend (src/App.jsx).
// Server is the source of truth for actual charges — the frontend copy is
// only for displaying a price before the request is made.

export const CONTACT_PRICE: Record<string, number> = {
  Newcomer: 5,
  RisingStar: 8,
  SilverQueen: 12,
  GoldQueen: 15,
  Platinum: 25,
  Diamond: 40,
};
export const priceForContact = (badge: string) => CONTACT_PRICE[badge] ?? 10;

export const BUM_RATE_PER_MIN: Record<string, number> = {
  SilverQueen: 1.2,
  GoldQueen: 2,
  Platinum: 3.5,
  Diamond: 6,
};
export const BUM_DURATIONS = [15, 30];
export const BUM_EXTEND_MIN = 15;
export const priceForBum = (badge: string, mins: number) =>
  Math.round((BUM_RATE_PER_MIN[badge] ?? 1) * mins * 100) / 100;

export const PLATFORM_CUT = Number(Deno.env.get("PLATFORM_CUT") ?? 0.3);
export const creatorCut = (amount: number) => Math.round(amount * (1 - PLATFORM_CUT) * 100) / 100;
export const platformFee = (amount: number) => Math.round((amount - creatorCut(amount)) * 100) / 100;

export const BUM_OK_BADGES = ["SilverQueen", "GoldQueen", "Platinum", "Diamond"];
