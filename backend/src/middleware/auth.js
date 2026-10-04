const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');

const COOKIE_NAME = 'lexskill_token';

// Verifies the session, then loads the CURRENT user from the database so that
// deactivated users and role changes take effect immediately.
async function authenticate(req, res, next) {
  try {
    const header = req.get('Authorization');
    const token =
      req.cookies?.[COOKIE_NAME] || (header && header.startsWith('Bearer ') ? header.slice(7) : null);
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in.');

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch (e) {
      if (e.name === 'TokenExpiredError') {
        throw new AppError(401, 'TOKEN_EXPIRED', 'Your session has expired. Please log in again.');
      }
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid session. Please log in again.');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, institutionId: true, email: true, name: true, cohortId: true, isActive: true },
    });
    if (!user || !user.isActive) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Account not found or disabled.');
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
  }
  next();
};

module.exports = { authenticate, requireRole, COOKIE_NAME };