import { z } from 'zod';

/**
 * One free-text question per request. Bounded at both ends: an empty string
 * wastes a model call, and an overlong one is either a mistake or an attempt
 * to stuff the context window.
 */
export const assistantQuerySchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, 'Ask a question of at least 3 characters')
    .max(1000, 'Question is too long (1000 characters maximum)'),
});

export default { assistantQuerySchema };
