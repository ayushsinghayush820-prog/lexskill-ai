const rateLimit = require('express-rate-limit');

const message = (text) => ({ error: { code: 'RATE_LIMITED', message: text } });

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Too many requests. Please slow down.'),
});

// Strict limiter for brute-force protection on login.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Too many login attempts. Try again in 15 minutes.'),
});

module.exports = { apiLimiter, loginLimiter };