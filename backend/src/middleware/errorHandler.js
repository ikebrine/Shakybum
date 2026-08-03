export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) {
    // Don't leak internals on 5xx, but do log server-side for debugging.
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
  res.status(status).json({ error: err.message, ...(err.paystack ? { paystack: err.paystack } : {}) });
}

// Wraps an async route handler so thrown errors reach errorHandler instead of
// crashing the process (Express doesn't auto-catch async rejections pre-v5).
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
