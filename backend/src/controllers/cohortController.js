const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { audit } = require('../services/auditService');

exports.list = asyncHandler(async (req, res) => {
  const cohorts = await prisma.cohort.findMany({
    where: { institutionId: req.user.institutionId },
    include: { _count: { select: { students: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ cohorts });
});

exports.create = asyncHandler(async (req, res) => {
  const cohort = await prisma.cohort.create({
    data: { institutionId: req.user.institutionId, name: req.body.name },
  });
  await audit({ req, action: 'COHORT_CREATED', entityType: 'Cohort', entityId: cohort.id });
  res.status(201).json({ cohort });
});