const AppError = require('../utils/AppError');

// Browsers cannot add custom headers on cross-site form posts, so requiring this
// header on every state-changing request blocks CSRF (together with SameSite cookies).
const csrfHeader = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'lexskill') {
    return next(new AppError(403, 'CSRF_BLOCKED', 'Missing required request header.'));
  }
  next();
};

module.exports = { csrfHeader };