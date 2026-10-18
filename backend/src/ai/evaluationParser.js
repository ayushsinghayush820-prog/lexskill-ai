const { z } = require('zod');

class MalformedAiResponseError extends Error {}

const clamp01 = z.number().transform((n) => Math.min(Math.max(n, 0), 1));

const criterionSchema = z.object({
  criterionId: z.string(),
  score: z.number().nullable(),
  rationale: z.string().max(3000),
  evidenceQuotes: z.array(z.string()).max(5).default([]),
  observations: z.array(z.string()).max(8).default([]),
  inferences: z.array(z.string()).max(8).default([]),
  confidence: clamp01,
  canAssess: z.boolean().default(true),
});

const aiSchema = z.object({
  criteria: z.array(criterionSchema).min(1),
  strengths: z.array(z.string()).max(10).default([]),
  weaknesses: z.array(z.string()).max(10).default([]),
  feedbackSuggestions: z.array(z.string()).max(10).default([]),
  authoritiesMentioned: z.array(z.object({ text: z.string(), proposition: z.string().optional() })).max(40).default([]),
  flags: z.array(z.object({ type: z.string(), message: z.string() })).max(20).default([]),
});

const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const round1 = (n) => Math.round(n * 10) / 10;

function extractJson(text) {
  const cleaned = String(text).replace(/```json|```/gi, '').trim();
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a === -1 || b <= a) throw new MalformedAiResponseError('no JSON object found');
  try {
    return JSON.parse(cleaned.slice(a, b + 1));
  } catch {
    throw new MalformedAiResponseError('response was not valid JSON');
  }
}

// Validates the model output and makes it safe: every rubric criterion must be present,
// scores are clamped, quotes are checked against the real submission, and the TOTAL is
// computed here by the server (never trusted from the model).
function parseAndNormalise({ text, criteria, submissionText }) {
  const parsed = aiSchema.safeParse(extractJson(text));
  if (!parsed.success) throw new MalformedAiResponseError('response did not match the expected structure');
  const data = parsed.data;

  const byId = new Map(data.criteria.map((c) => [c.criterionId, c]));
  const missing = criteria.filter((c) => !byId.has(c.id));
  if (missing.length) throw new MalformedAiResponseError(`missing ${missing.length} rubric criteria`);

  const flags = data.flags.map((f) => ({ type: f.type.slice(0, 40).toUpperCase(), message: f.message.slice(0, 300) }));
  const haystack = norm(submissionText);
  let unverifiedQuotes = 0;

  const out = criteria.map((c) => {
    const a = byId.get(c.id);
    const score = a.canAssess && a.score !== null ? round1(Math.min(Math.max(a.score, 0), c.maxScore)) : null;
    if (score === null) flags.push({ type: 'CANNOT_ASSESS', message: `AI could not assess: ${c.name}` });
    if (a.confidence < 0.5) flags.push({ type: 'LOW_CONFIDENCE', message: `Low confidence on: ${c.name}` });
    const evidenceQuotes = a.evidenceQuotes.map((q) => {
      const verified = norm(q).length > 0 && haystack.includes(norm(q));
      if (!verified) unverifiedQuotes++;
      return { text: q.slice(0, 400), verified };
    });
    return {
      criterionId: c.id,
      name: c.name,
      skillDimension: c.skillDimension,
      maxScore: c.maxScore,
      score,
      rationale: a.rationale,
      evidenceQuotes,
      observations: a.observations,
      inferences: a.inferences,
      confidence: a.confidence,
      canAssess: score !== null,
    };
  });

  if (unverifiedQuotes) {
    flags.push({
      type: 'QUOTE_NOT_FOUND',
      message: `${unverifiedQuotes} evidence quote(s) were not found verbatim in the submission. Treat with caution.`,
    });
  }

  const assessed = out.filter((c) => c.score !== null);
  const overallScore = round1(assessed.reduce((s, c) => s + c.score, 0));
  const confidence = Math.round((out.reduce((s, c) => s + c.confidence, 0) / out.length) * 100) / 100;

  return {
    overallScore,
    confidence,
    result: {
      criteria: out,
      strengths: data.strengths,
      weaknesses: data.weaknesses,
      feedbackSuggestions: data.feedbackSuggestions,
      authoritiesMentioned: data.authoritiesMentioned,
      flags,
      totals: {
        score: overallScore,
        assessedMax: assessed.reduce((s, c) => s + c.maxScore, 0),
        max: criteria.reduce((s, c) => s + c.maxScore, 0),
      },
      disclaimer: 'AI-assisted draft prepared for the examiner. It may contain errors. The examiner decides every mark.',
    },
  };
}

module.exports = { parseAndNormalise, MalformedAiResponseError };