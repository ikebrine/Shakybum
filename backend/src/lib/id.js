import crypto from "crypto";

export const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
