import Anthropic from '@anthropic-ai/sdk';
import config from '../config/env.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';
import auditService from './audit.service.js';

/**
 * AI query assistant (issues #49, #50).
 *
 * Answers a natural-language question about the audit trail by giving Claude
 * exactly one tool — a parameterized query against the same audit service the
 * REST endpoint uses — and then summarizing the rows that come back. The model
 * never sees the database and never writes SQL: it only chooses filters, and
 * the handler below runs them.
 *
 * Grounding is the point. The endpoint returns the matched records alongside
 * the answer so the auditor can check the summary against the underlying
 * evidence rather than taking it on trust.
 */

const AUDIT_TYPES = [
  'IDENTITY_CREATED',
  'ROLE_ASSIGNED',
  'ASSET_MINTED',
  'TRANSFER_REQUESTED',
  'TRANSFER_REJECTED',
  'OWNERSHIP_TRANSFERRED',
  'PACS_ACCESS_GRANTED',
  'PACS_ACCESS_DENIED',
];

// Caps on one question: how many rows a single tool call may return, and how
// many times the model may query before we stop the loop. Both exist so a
// vague question ("show me everything") can't pull the whole table into the
// context window or spin the loop indefinitely.
const MAX_ROWS_PER_CALL = 50;
const MAX_TOOL_ROUNDS = 5;

const QUERY_AUDIT_TRAIL_TOOL = {
  name: 'query_audit_trail',
  description:
    'Search the BELTAL on-chain audit trail. Returns immutable audit events ' +
    '(identity registrations, role assignments, asset mints, custody transfer ' +
    'requests/rejections/executions) and PACS badge-tap decisions, newest first. ' +
    'Call this before answering any question about what happened in the system; ' +
    'never answer from memory. Call it again with different filters if the first ' +
    'result set does not answer the question.',
  input_schema: {
    type: 'object',
    properties: {
      actionType: {
        type: 'string',
        description:
          'Comma-separated event types to include. Omit for all types. One or more of: ' +
          AUDIT_TYPES.join(', '),
      },
      actorId: {
        type: 'string',
        description: 'User id of the person who performed the action.',
      },
      targetId: {
        type: 'string',
        description:
          'The id of the thing acted on — an asset id, a DID, or a facility zone id.',
      },
      txHash: {
        type: 'string',
        description: 'Exact on-chain transaction hash.',
      },
      from: {
        type: 'string',
        description: 'Start of the date range, ISO-8601 (e.g. 2026-09-01T00:00:00Z).',
      },
      to: {
        type: 'string',
        description: 'End of the date range, ISO-8601.',
      },
      limit: {
        type: 'integer',
        description: `Maximum rows to return (1–${MAX_ROWS_PER_CALL}). Defaults to 20.`,
      },
    },
    required: [],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You are the BELTAL audit assistant. BELTAL is a blockchain-backed identity, access-control and asset-custody ledger for Bharat Electronics Limited.

Answer questions about the audit trail using only rows returned by the query_audit_trail tool. Never invent an event, a name, a date or a transaction hash. If the tool returns no rows, say plainly that there are no matching records — do not speculate about why.

Event types you will see:
- IDENTITY_CREATED — a person's DID was anchored on-chain
- ROLE_ASSIGNED — a role or clearance level was granted or changed
- ASSET_MINTED — a soulbound custody token was created for a piece of equipment
- TRANSFER_REQUESTED / TRANSFER_REJECTED / OWNERSHIP_TRANSFERRED — the custody handover flow
- PACS_ACCESS_GRANTED / PACS_ACCESS_DENIED — a badge tap at a facility zone

Keep answers short and factual — a few sentences, or a compact list when several records matter. Quote transaction hashes and dates exactly as the tool returns them. The interface already shows the matching records underneath your answer, so summarize and interpret rather than re-listing every row.`;

let cachedClient = null;

function getClient() {
  if (!config.anthropicApiKey) {
    throw new ApiError(
      503,
      'The AI assistant is not configured on this server (ANTHROPIC_API_KEY is unset)'
    );
  }
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return cachedClient;
}

/**
 * Runs one tool call against the real audit service.
 *
 * Scope note: this mirrors the REST audit endpoint exactly. /api/audit is
 * gated to ADMIN and AUDITOR, both of which scope.service treats as
 * unrestricted, so the audit trail is deliberately not SBU-filtered. The route
 * carries the same requireRole gate, which is what keeps the assistant from
 * seeing more than its caller could read for themselves. If audit access is
 * ever widened to MANAGER, this handler must start applying
 * scopeService.getSbuScope, and so must the REST endpoint.
 */
async function runQueryAuditTrail(input) {
  const limit = Math.min(
    Math.max(Number.parseInt(input.limit, 10) || 20, 1),
    MAX_ROWS_PER_CALL
  );

  // Reject unknown event types rather than silently returning everything —
  // a hallucinated type name should read as "no such type", not as "all rows".
  const requestedTypes = (input.actionType || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const unknownTypes = requestedTypes.filter((t) => !AUDIT_TYPES.includes(t));
  if (unknownTypes.length > 0) {
    return {
      error: `Unknown event type(s): ${unknownTypes.join(', ')}. Valid types are: ${AUDIT_TYPES.join(', ')}`,
    };
  }

  const { events, pagination } = await auditService.getAuditTrail({
    type: requestedTypes.length > 0 ? requestedTypes.join(',') : undefined,
    actorId: input.actorId || undefined,
    targetId: input.targetId || undefined,
    txHash: input.txHash || undefined,
    from: input.from || undefined,
    to: input.to || undefined,
    page: 1,
    limit,
  });

  return {
    totalMatching: pagination.total,
    returned: events.length,
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      actor: e.actor ? { id: e.actor.id, displayName: e.actor.displayName } : null,
      targetId: e.targetId,
      txHash: e.txHash,
      timestamp: e.timestamp,
      payload: e.payload,
    })),
  };
}

export const assistantService = {
  /**
   * Question in, grounded answer out. Returns the model's summary plus every
   * record it actually looked at, so the answer can be checked rather than
   * trusted.
   */
  async answerQuery({ question }) {
    const client = getClient();

    const messages = [{ role: 'user', content: question }];
    // Rows accumulated across every tool call this question made, deduped by
    // id — these are what the UI renders under the answer as the evidence.
    const matchedById = new Map();
    const queriesRun = [];

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const response = await client.messages.create({
          model: 'claude-opus-5',
          max_tokens: 4096,
          // Reading back a handful of database rows and summarizing them is a
          // shallow task; medium effort keeps it responsive and cheap without
          // costing accuracy on the filter choice.
          output_config: { effort: 'medium' },
          system: SYSTEM_PROMPT,
          tools: [QUERY_AUDIT_TRAIL_TOOL],
          messages,
        });

        if (response.stop_reason === 'refusal') {
          logger.warn(
            `Assistant declined a question (${response.stop_details?.category ?? 'unspecified'})`
          );
          throw new ApiError(422, 'The assistant could not answer that question.');
        }

        messages.push({ role: 'assistant', content: response.content });

        const toolUses = response.content.filter((block) => block.type === 'tool_use');

        if (toolUses.length === 0) {
          const answer = response.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('\n')
            .trim();

          return {
            answer: answer || 'The assistant returned no answer for that question.',
            queries: queriesRun,
            matchedRecords: [...matchedById.values()],
          };
        }

        // Every tool_result for one assistant turn must go back in a single
        // user message, or parallel tool use quietly stops happening.
        const toolResults = [];
        for (const toolUse of toolUses) {
          if (toolUse.name !== QUERY_AUDIT_TRAIL_TOOL.name) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              is_error: true,
              content: `Unknown tool: ${toolUse.name}`,
            });
            continue;
          }

          try {
            const result = await runQueryAuditTrail(toolUse.input ?? {});
            if (!result.error) {
              queriesRun.push(toolUse.input ?? {});
              for (const event of result.events) matchedById.set(event.id, event);
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            // A failed query is reported back to the model so it can adjust,
            // rather than aborting the whole request.
            logger.error(`Assistant tool call failed: ${err.message}`);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              is_error: true,
              content: 'That query could not be run. Try different filters.',
            });
          }
        }

        messages.push({ role: 'user', content: toolResults });
      }

      // Ran out of rounds — return what was gathered instead of an error, so
      // the auditor still sees the evidence.
      return {
        answer:
          'The assistant ran out of query steps before reaching a conclusion. The records it gathered are shown below; try a narrower question.',
        queries: queriesRun,
        matchedRecords: [...matchedById.values()],
      };
    } catch (err) {
      if (err instanceof ApiError) throw err;

      // Nothing from the provider reaches the client verbatim: the raw errors
      // carry request ids, model names and occasionally prompt fragments.
      if (err instanceof Anthropic.RateLimitError) {
        logger.warn('Anthropic rate limit hit on assistant query');
        throw new ApiError(429, 'The assistant is busy right now. Try again in a moment.');
      }
      if (err instanceof Anthropic.AuthenticationError) {
        logger.error('Anthropic authentication failed — check ANTHROPIC_API_KEY');
        throw new ApiError(503, 'The AI assistant is not configured correctly on this server.');
      }
      if (err instanceof Anthropic.APIError) {
        logger.error(`Anthropic API error ${err.status}: ${err.message}`);
        throw new ApiError(502, 'The assistant is temporarily unavailable.');
      }
      logger.error(`Assistant query failed: ${err.message}`);
      throw new ApiError(500, 'The assistant could not complete that request.');
    }
  },

  isConfigured() {
    return Boolean(config.anthropicApiKey);
  },
};

export default assistantService;
