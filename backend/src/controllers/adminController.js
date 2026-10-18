const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { audit } = require('../services/auditService');
const { assertCohort } = require('../services/assessmentService');

// passwordHash is NEVER selected.
const SAFE_USER = {
  id: true, name: true, email: true, role: true, studentNumber: true,
  cohortId: true, isActive: true, createdAt: true, lastLoginAt: true,
};

exports.listUsers = asyncHandler(async (req, res) => {
  const where = { institutionId: req.user.institutionId };
  if (req.query.role) where.role = req.query.role;
  const users = await prisma.user.findMany({ where, select: SAFE_USER, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
  res.json({ users });
});

exports.createUser = asyncHandler(async (req, res) => {
  const { password, cohortId, ...data } = req.body;
  if (data.role === 'STUDENT') await assertCohort(req.user.institutionId, cohortId);

  const user = await prisma.user.create({
    data: {
      ...data,
      cohortId: data.role === 'STUDENT' ? cohortId : null,
      institutionId: req.user.institutionId,
      passwordHash: await bcrypt.hash(password, 12),
    },
    select: SAFE_USER,
  });
  await audit({ req, action: 'USER_CREATED', entityType: 'User', entityId: user.id, metadata: { role: user.role } });
  res.status(201).json({ user });
});

exports.updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.user.findFirst({ where: { id, institutionId: req.user.institutionId } });
  if (!existing) throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');

  const { newPassword, ...rest } = req.body;
  if (id === req.user.id && rest.isActive === false) {
    throw new AppError(400, 'CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account.');
  }
  if (rest.cohortId) await assertCohort(req.user.institutionId, rest.cohortId);

  const data = { ...rest };
  if (newPassword) data.passwordHash = await bcrypt.hash(newPassword, 12);

  const user = await prisma.user.update({ where: { id }, data, select: SAFE_USER });
  await audit({
    req, action: 'USER_UPDATED', entityType: 'User', entityId: id,
    metadata: { fields: [...Object.keys(rest), ...(newPassword ? ['password'] : [])] },
  });
  res.json({ user });
});
