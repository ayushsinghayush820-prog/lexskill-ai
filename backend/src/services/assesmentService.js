const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');

// Tenant-safe lookup: the assessment must belong to this institution AND this faculty member.
async function getOwned(user, id, include) {
  const assessment = await prisma.assessment.findFirst({
    where: { id, institutionId: user.institutionId, createdById: user.id },
    include,
  });
  if (!assessment) throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  return assessment;
}

async function assertCohort(institutionId, cohortId) {
  const cohort = await prisma.cohort.findFirst({ where: { id: cohortId, institutionId } });
  if (!cohort) throw new AppError(404, 'COHORT_NOT_FOUND', 'Cohort not found.');
  return cohort;
}

function toCriteriaRows(criteria) {
  return criteria.map((c, i) => ({
    name: c.name,
    description: c.description ?? null,
    skillDimension: c.skillDimension,
    maxScore: c.maxScore,
    descriptors: c.descriptors ?? undefined,
    position: i,
  }));
}

function withTotal(assessment) {
  if (!assessment.criteria) return assessment;
  return { ...assessment, totalMarks: assessment.criteria.reduce((s, c) => s + c.maxScore, 0) };
}

module.exports = { getOwned, assertCohort, toCriteriaRows, withTotal };