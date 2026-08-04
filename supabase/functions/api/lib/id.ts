export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
