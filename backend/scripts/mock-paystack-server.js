// Mock Paystack server for local dev/testing — NOT for production use.
// Thin CLI wrapper around src/lib/mockPaystackApp.js (also used in-process
// by the automated test suite, with faster delays — see src/__tests__/).
//
// Usage: PAYSTACK_SECRET_KEY=<same as backend .env> node scripts/mock-paystack-server.js
import { createMockPaystackApp } from "../src/lib/mockPaystackApp.js";

const SECRET = process.env.PAYSTACK_SECRET_KEY;
const WEBHOOK_URL = process.env.BACKEND_WEBHOOK_URL || "http://localhost:4000/api/webhooks/paystack";
const AUTO_SUCCEED = process.env.MOCK_PAYSTACK_AUTOSUCCEED !== "false";
const PORT = process.env.MOCK_PAYSTACK_PORT || 5555;

const app = createMockPaystackApp({ webhookUrl: WEBHOOK_URL, secretKey: SECRET, autoSucceed: AUTO_SUCCEED, delayMs: 800 });
app.listen(PORT, () => console.log(`[mock-paystack] listening on :${PORT}, webhooks -> ${WEBHOOK_URL}`));
