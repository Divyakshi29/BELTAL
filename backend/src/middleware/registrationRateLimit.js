import rateLimit from 'express-rate-limit';

/**
 * Per-IP limits for the self-registration endpoints, on top of the general
 * apiLimiter in app.js. Submitting a request is rare and creates a row an admin
 * has to review, so it gets a tight ceiling; the status endpoint is polled by
 * the waiting page (every ~10s, ~90 calls per window) and needs headroom.
 */
const WINDOW_MS = 15 * 60 * 1000;

export const registrationSubmitLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many registration attempts, please try again later.', status: 429 } },
});

export const registrationStatusLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many status checks, please slow down.', status: 429 } },
});

export default { registrationSubmitLimiter, registrationStatusLimiter };
