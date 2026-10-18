const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');
const llm = require('../ai/llmGateway');
const { PROMPT_VERSION, SYSTEM_PROMPT, buildUserPrompt } = require('../ai/prompts/evaluateSubmission');
const { parseAndNormalise, MalformedAiResponseError } = require('../ai/evaluationParser');
const { audit } = require('./auditService');

const MAX_ATTEMPTS = 3; // cost control: at most 3 AI calls per submission
const STALE_MS = 3 * 60 * 1000; // a PENDING row older than this is treated as dead

// Guards (cost control), creates a PENDING row, and runs the AI in the background.
async function queueEvaluation(submissionId, { institutionId, actorId = null, ip = null }) {
  const submission = await prisma.submission.findFirst({ where: { id: submissionId, institutionId }, select: { id: true } });
  if (!submission) throw new AppError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found.');

  const evaluations = await prisma.aiEvaluation.findMany({
    where: { submissionId },
    orderBy: { startedAt: 'desc' },
    select: { id: true, status: true, startedAt: true },
  });
  const latest = evaluations[0];

  if (latest?.status === 'COMPLETED') {
    throw new AppError(409, 'AI_ALREADY_COMPLETED', 'An AI evaluation already exists for this submission.');
  }
  if (latest?.status === 'PENDING') {
    if (Date.now() - latest.startedAt.getTime() < STALE_MS) {
      throw new AppError(409, 'AI_IN_PROGRESS', 'An AI evaluation is already running. Please wait.');
    }
    await prisma.aiEvaluation.update({
      where: { id: latest.id },
      data: { status: 'FAILED', errorMessage: 'Timed out (the server restarted or the request hung).', completedAt: new Date() },
    });
  }
  if (evaluations.length >= MAX_ATTEMPTS) {
    throw new AppError(409, 'AI_ATTEMPTS_EXHAUSTED', 'The AI retry limit was reached. Please evaluate this submission manually.');
  }

  const info = llm.info();
  const evaluation = await prisma.aiEvaluation.create({
    data: {
      submissionId,
      status: 'PENDING',
      attempt: evaluations.length + 1,
      provider: info.provider,
      model: info.model,
      promptVersion: PROMPT_VERSION,
    },
  });
  await audit({
    institutionId, actorId, ip,
    action: 'AI_EVALUATION_STARTED',
    entityType: 'Submission',
    entityId: submissionId,
    metadata: { evaluationId: evaluation.id, attempt: evaluation.attempt, provider: info.provider, model: info.model, promptVersion: PROMPT_VERSION },
  });

  setImmediate(() => {
    execute(evaluation.id, { institutionId, ip }).catch((e) => console.error('AI_EXECUTE_CRASH', e.message));
  });
  return evaluation;
}

// Runs one evaluation. A failure here NEVER touches the submission: it is stored as FAILED.
async function execute(evaluationId, { institutionId, ip }) {
  const evaluation = await prisma.aiEvaluation.findUnique({
    where: { id: evaluationId },
    include: { submission: { include: { assessment: { include: { criteria: { orderBy: { position: 'asc' } } } } } } },
  });
  if (!evaluation) return;
  const { submission } = evaluation;
  const { assessment } = submission;
  const criteria = assessment.criteria;

  try {
    const out = await llm.complete({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt({ assessment, criteria, submissionText: submission.content }),
      meta: {
        criteria: criteria.map((c) => ({ id: c.id, name: c.name, maxScore: c.maxScore })),
        submissionText: submission.content,
      },
    });
    const parsed = parseAndNormalise({ text: out.text, criteria, submissionText: submission.content });
    parsed.result._meta = { usage: out.usage || null, provider: evaluation.provider, model: out.model || evaluation.model, promptVersion: evaluation.promptVersion };

    await prisma.aiEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: 'COMPLETED',
        result: parsed.result,
        overallScore: parsed.overallScore,
        confidence: parsed.confidence,
        model: out.model || evaluation.model,
        completedAt: new Date(),
      },
    });
    await audit({
      institutionId, ip, action: 'AI_EVALUATION_COMPLETED', entityType: 'Submission', entityId: submission.id,
      metadata: { evaluationId, attempt: evaluation.attempt, flags: parsed.result.flags.length },
    });
  } catch (err) {
    const message =
      err instanceof MalformedAiResponseError
        ? `AI returned an unusable response (${err.message}).`
        : `AI service error: ${err.message}`;
    await prisma.aiEvaluation.update({
      where: { id: evaluationId },
      data: { status: 'FAILED', errorMessage: message.slice(0, 500), completedAt: new Date() },
    });
    await audit({
      institutionId, ip, action: 'AI_EVALUATION_FAILED', entityType: 'Submission', entityId: submission.id,
      metadata: { evaluationId, attempt: evaluation.attempt },
    });
  }
}

module.exports = { queueEvaluation, MAX_ATTEMPTS, STALE_MS };