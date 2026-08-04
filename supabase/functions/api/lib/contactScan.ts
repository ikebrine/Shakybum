// Server-side mirror of the frontend's scanContactInfo (src/App.jsx).
// The frontend check exists for instant UX feedback; THIS is the one that
// actually matters, since a client-side-only check can be bypassed by
// calling the API directly. Keep both in sync if the rules change.

const DIGIT_WORDS = ["zero", "oh", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const CONTACT_KEYWORDS = [
  "whatsapp", "wa.me", "w.me", "t.me", "telegram", "snapchat", "snap:", "snap me",
  "ig:", "insta:", "instagram.com", "facebook.com", "fb.com", "tiktok:",
  "call me", "text me", "dm me on", "reach me at", "contact me at", "my whatsapp",
  "add me on", "hit me up", "message me on", "email me at",
];

export function scanContactInfo(text?: string | null): { flagged: boolean; reason?: string } {
  if (!text || !text.trim()) return { flagged: false };
  const raw = text;
  const t = text.toLowerCase();

  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw)) {
    return { flagged: true, reason: "an email address" };
  }

  if (/(?:\d[\s.\-()]*){7,}/.test(raw)) {
    return { flagged: true, reason: "a phone number" };
  }

  const wordPattern = new RegExp(`\\b(${DIGIT_WORDS.join("|")})\\b(?:[\\s,-]+\\b(${DIGIT_WORDS.join("|")})\\b){5,}`, "i");
  if (wordPattern.test(raw)) {
    return { flagged: true, reason: "a spelled-out phone number" };
  }

  for (const keyword of CONTACT_KEYWORDS) {
    if (t.includes(keyword)) return { flagged: true, reason: `a mention of "${keyword}"` };
  }

  return { flagged: false };
}
