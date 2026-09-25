import rateLimit from 'express-rate-limit';

/**
 * Per-IP ceiling for the AI assistant. Every call costs real money at the
 * model provider and can fan out into several database queries, so it is
 * limited far more tightly than an ordinary read endpoint.
 */
export const assistantQueryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many assistant questions, please wait a few minutes.',
      status: 429,
    },
  },
});

export default { assistantQueryLimiter };
