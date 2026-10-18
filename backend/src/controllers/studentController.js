const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { audit } = require('../services/auditService');

// PDR rule: students see nothing about AI drafts or unreleased results.
// Internal statuses are collapsed to what a student is allowed to know.
function studentStatus(submission) {
  if (!submission) return 'NOT_SUBMITTED';
  if (submission.status === 'RELEASED') return 'RELEASED';
  if (submission.status === 'REEVAL_REQUESTED') return 'REEVAL_REQUESTED';
  return 'SUBMITTED'; // SUBMITTED / IN_REVIEW / FINALISED-but-not-released
}

const VISIBLE = { in: ['PUBLISHED', 'CLOSED'] };

async function getAssignment(user, assessmentId) {
  const assignment = await prisma.assessmentAssignment.findUnique({
    where: { assessmentId_studentId: { assessmentId, studentId: user.id } },
    include: { assessment: { include: { criteria: { orderBy: { position: 'asc' } } } } },
  });
  if (
    !assignment ||
    assignment.assessment.institutionId !== user.institutionId ||
    !VISIBLE.in.includes(assignment.assessment.status)
  ) {
    throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  }
  return assignment;
}

exports.listAssessments = asyncHandler(async (req, res) => {
  const assignments = await prisma.assessmentAssignment.findMany({
    where: {
      studentId: req.user.id,
      assessment: { institutionId: req.user.institutionId, status: VISIBLE },
    },
    include: {
      assessment: {
        select: { id: true, title: true, courseName: true, integrityMode: true, dueAt: true, status: true, publishedAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  const submissions = await prisma.submission.findMany({
    where: { studentId: req.user.id, assessmentId: { in: assignments.map((a) => a.assessmentId) } },
    select: { assessmentId: true, status: true, submittedAt: true },
  });
  const byAssessment = new Map(submissions.map((s) => [s.assessmentId, s]));

  res.json({
    assessments: assignments.map((a) => {
      const sub = byAssessment.get(a.assessmentId);
      return { ...a.assessment, myStatus: studentStatus(sub), submittedAt: sub?.submittedAt ?? null };
    }),
  });
});

exports.getAssessment = asyncHandler(async (req, res) => {
  const { assessment } = await getAssignment(req.user, req.params.id);
  const submission = await prisma.submission.findUnique({
    where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: req.user.id } },
  });
  res.json({
    assessment: {
      id: assessment.id,
      title: assessment.title,
      courseName: assessment.courseName,
      instructions: assessment.instructions,
      integrityMode: assessment.integrityMode,
      dueAt: assessment.dueAt,
      status: assessment.status,
      criteria: assessment.criteria.map((c) => ({
        id: c.id, name: c.name, description: c.description, skillDimension: c.skillDimension, maxScore: c.maxScore,
      })),
    },
    mySubmission: submission
      ? {
          id: submission.id,
          status: studentStatus(submission),
          content: submission.content,
          wordCount: submission.wordCount,
          submittedAt: submission.submittedAt,
        }
      : null,
  });
});

exports.submit = asyncHandler(async (req, res) => {
  const { assessment } = await getAssignment(req.user, req.params.id);

  if (assessment.status !== 'PUBLISHED') {
    throw new AppError(403, 'ASSESSMENT_CLOSED', 'This assessment is closed for submissions.');
  }
  if (assessment.dueAt && assessment.dueAt <= new Date()) {
    throw new AppError(403, 'DEADLINE_PASSED', 'The deadline for this assessment has passed.');
  }
  const existing = await prisma.submission.findUnique({
    where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: req.user.id } },
    select: { id: true },
  });
  if (existing) throw new AppError(409, 'ALREADY_SUBMITTED', 'You have already submitted this assessment.');

  const content = req.body.content;
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  const submission = await prisma.submission.create({
    data: {
      institutionId: req.user.institutionId,
      assessmentId: assessment.id,
      studentId: req.user.id,
      content,
      wordCount,
    },
    select: { id: true, status: true, submittedAt: true, wordCount: true },
  });
  // Audit stores IDs and counts only, never the student's text.
  await audit({
    req, action: 'SUBMISSION_CREATED', entityType: 'Submission', entityId: submission.id,
    metadata: { assessmentId: assessment.id, wordCount },
  });
  // PART 3 adds one line here: start the AI first-pass evaluation.
  res.status(201).json({
    submission: { ...submission, status: 'SUBMITTED' },
    message: 'Submitted. Your examiner will release feedback after review.',
  });
});