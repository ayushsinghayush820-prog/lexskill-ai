const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { audit } = require('../services/auditService');
const { COOKIE_NAME } = require('../middleware/auth');

// Used so login takes the same time whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax',
  maxAge: env.SESSION_HOURS * 60 * 60 * 1000,
  path: '/',
});

const shapeUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  studentNumber: u.studentNumber,
  cohortId: u.cohortId,
  institution: u.institution ? { id: u.institution.id, name: u.institution.name } : undefined,
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, include: { institution: true } });
  const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !passwordOk || !user.isActive) {
    await audit({
      req,
      institutionId: user?.institutionId,
      actorId: user?.id,
      action: 'LOGIN_FAILED',
    });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: `${env.SESSION_HOURS}h`,
  });
  res.cookie(COOKIE_NAME, token, cookieOptions());

  await audit({ req, institutionId: user.institutionId, actorId: user.id, action: 'LOGIN' });
  res.json({ user: shapeUser(user) });
});

exports.logout = asyncHandler(async (req, res) => {
  const { maxAge, ...clearOpts } = cookieOptions();
  res.clearCookie(COOKIE_NAME, clearOpts);
  res.json({ ok: true });
});

exports.me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { institution: true },
  });
  res.json({ user: shapeUser(user) });
});