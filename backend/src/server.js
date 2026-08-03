import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

import { migrate } from "./db/index.js";
import { errorHandler } from "./middleware/errorHandler.js";

import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import bumRoutes from "./routes/bum.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";

migrate();

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));

// Paystack webhook needs the raw body for signature verification — mounted
// BEFORE express.json() so it never gets parsed/re-serialized first.
app.use("/api/webhooks", express.raw({ type: "application/json" }), paymentsRoutes);

app.use(express.json());

// Payment-initiating endpoints get a tighter rate limit — these trigger real
// MoMo charges, so this is a fraud/abuse control, not just a DoS guard.
const paymentLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
app.use("/api/contact-requests", paymentLimiter);
app.use("/api/bum-sessions", paymentLimiter);

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/contact-requests", contactRoutes);
app.use("/api/bum-sessions", bumRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/notifications", notificationsRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Shakybum backend listening on :${PORT}`));
