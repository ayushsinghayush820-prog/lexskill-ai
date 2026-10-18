const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { audit } = require('../services/auditService');
const { getOwned, assertCohort, toCriteriaRows, withTotal } = require('../services/assessmentService');

const CRITERIA_INCLUDE = { criteria: { orderBy: { position: 'asc' } } };

exports.create = asyncHandler(async (req, res) => {
  const { criteria, dueAt, ...data } = req.body;
  await assertCohort(req.user.institutionId, data.cohortId);

  const assessment = await prisma.assessment.create({
    data: {
      ...data,
      dueAt: dueAt ? new Date(dueAt) : null,
      institutionId: req.user.institutionId,
      createdById: req.user.id,
      criteria: { create: toCriteriaRows(criteria) },
    },
    include: CRITERIA_INCLUDE,
  });
  await audit({ req, action: 'ASSESSMENT_CREATED', entityType: 'Assessment', entityId: assessment.id });
  res.status(201).json({ assessment: withTotal(assessment) });
});

exports.list = asyncHandler(async (req, res) => {
  const assessments = await prisma.assessment.findMany({
    where: { institutionId: req.user.institutionId, createdById: req.user.id },
    include: {
      cohort: { select: { id: true, name: true } },
      _count: { select: { assignments: true, submissions: true, criteria: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ assessments });
});

exports.get = asyncHandler(async (req, res) => {
  const assessment = await getOwned(req.user, req.params.id, {
    ...CRITERIA_INCLUDE,
    cohort: { select: { id: true, name: true } },
    _count: { select: { assignments: true, submissions: true } },
  });
  res.json({ assessment: withTotal(assessment) });
});

exports.update = asyncHandler(async (req, res) => {
  const a = await getOwned(req.user, req.params.id);
  const { dueAt, ...rest } = req.body;

  if (a.status === 'CLOSED') throw new AppError(409, 'ASSESSMENT_CLOSED', 'A closed assessment cannot be edited.');
  if (a.status === 'PUBLISHED' && Object.keys(rest).length > 0) {
    throw new AppError(409, 'ASSESSMENT_LOCKED', 'A published assessment is locked. Only the due date can change.');
  }
  if (rest.cohortId) await assertCohort(req.user.institutionId, rest.cohortId);

  const data = { ...rest };
  if (dueAt !== undefined) data.dueAt = dueAt ? new Date(dueAt) : null;

  const assessment = await prisma.assessment.update({ where: { id: a.id }, data, include: CRITERIA_INCLUDE });
  await audit({
    req, action: 'ASSESSMENT_UPDATED', entityType: 'Assessment', entityId: a.id,
    metadata: { fields: Object.keys(req.body) },
  });
  res.json({ assessment: withTotal(assessment) });
});

exports.getRubric = asyncHandler(async (req, res) => {
  const a = await getOwned(req.user, req.params.id, CRITERIA_INCLUDE);
  res.json({ criteria: a.criteria, totalMarks: withTotal(a).totalMarks });
});

exports.replaceRubric = asyncHandler(async (req, res) => {
  const a = await getOwned(req.user, req.params.id);
  if (a.status !== 'DRAFT') {
    throw new AppError(409, 'ASSESSMENT_LOCKED', 'The rubric can only be changed while the assessment is a draft.');
  }
  await prisma.$transaction([
    prisma.rubricCriterion.deleteMany({ where: { assessmentId: a.id } }),
    prisma.rubricCriterion.createMany({
      data: toCriteriaRows(req.body.criteria).map((c) => ({ ...c, assessmentId: a.id })),
    }),
  ]);
  const updated = await prisma.assessment.findUnique({ where: { id: a.id }, include: CRITERIA_INCLUDE });
  await audit({ req, action: 'RUBRIC_UPDATED', entityType: 'Assessment', entityId: a.id });
  res.json({ criteria: updated.criteria, totalMarks: withTotal(updated).totalMarks });
});

exports.publish = asyncHandler(async (req, res) => {
  const a = await getOwned(req.user, req.params.id);
  if (a.status !== 'DRAFT') throw new AppError(409, 'ALREADY_PUBLISHED', 'This assessment is already published.');
  if (a.dueAt && a.dueAt <= new Date()) {
    throw new AppError(409, 'DUE_DATE_PASSED', 'The due date is in the past. Update it before publishing.');
  }
  const criteriaCount = await prisma.rubricCriterion.count({ where: { assessmentId: a.id } });
  if (criteriaCount === 0) throw new AppError(409, 'NO_RUBRIC', 'Add at least one rubric criterion before publishing.');

  const students = await prisma.user.findMany({
    where: { institutionId: req.user.institutionId, cohortId: a.cohortId, role: 'STUDENT', isActive: true },
    select: { id: true },
  });
  if (students.length === 0) throw new AppError(409, 'NO_STUDENTS', 'This cohort has no active students to assign.');

  const [assessment] = await prisma.$transaction([
    prisma.assessment.update({ where: { id: a.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } }),
    prisma.assessmentAssignment.createMany({
      data: students.map((s) => ({ assessmentId: a.id, studentId: s.id })),
      skipDuplicates: true,
    }),
  ]);
  await audit({
    req, action: 'ASSESSMENT_PUBLISHED', entityType: 'Assessment', entityId: a.id,
    metadata: { assignedCount: students.length },
  });
  res.json({ assessment, assignedCount: students.length });
});

exports.close = asyncHandler(async (req, res) => {
  const a = await getOwned(req.user, req.params.id);
  if (a.status !== 'PUBLISHED') throw new AppError(409, 'NOT_PUBLISHED', 'Only a published assessment can be closed.');
  const assessment = await prisma.assessment.update({ where: { id: a.id }, data: { status: 'CLOSED' } });
  await audit({ req, action: 'ASSESSMENT_CLOSED', entityType: 'Assessment', entityId: a.id });
  res.json({ assessment });
});

// Submission LIST only: no student text here. Reading a submission comes in Part 3.
exports.listSubmissions = asyncHandler(async (req, res) => {
  const a = await getOwned(req.user, req.params.id);
  const [assignedCount, submissions] = await Promise.all([
    prisma.assessmentAssignment.count({ where: { assessmentId: a.id } }),
    prisma.submission.findMany({
      where: { assessmentId: a.id, institutionId: req.user.institutionId },
      select: {
        id: true, status: true, submittedAt: true, wordCount: true,
        student: { select: { id: true, name: true, studentNumber: true } },
        aiEvaluations: { select: { status: true, attempt: true }, orderBy: { startedAt: 'desc' }, take: 1 },
        review: { select: { status: true } },
      },
      orderBy: { submittedAt: 'asc' },
    }),
  ]);
  res.json({
    assessment: { id: a.id, title: a.title, status: a.status },
    assignedCount,
    notSubmittedCount: assignedCount - submissions.length,
    submissions: submissions.map((s) => ({
      id: s.id,
      status: s.status,
      submittedAt: s.submittedAt,
      wordCount: s.wordCount,
      student: s.student,
      aiStatus: s.aiEvaluations[0]?.status ?? null,
      reviewStatus: s.review?.status ?? null,
    })),
  });
});