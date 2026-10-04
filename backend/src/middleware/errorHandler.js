const { ZodError } = require('zod');
const { Prisma } = require('@prisma/client');
const AppError = require('../utils/AppError');

function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
}

function send(res, status, code, message, details) {
  return res.status(status).json({ error: { code, message, details } });
}

// Standard error shape for the whole API:
// { "error": { "code": "...", "message": "...", "details": ... } }
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) return send(res, err.status, err.code, err.message, err.details);
  if (err.type === 'entity.parse.failed') return send(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
  if (err.type === 'entity.too.large') return send(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return send(res, 400, 'VALIDATION_ERROR', 'Some fields are invalid.', details);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return send(res, 409, 'CONFLICT', 'A record with these details already exists.');
    if (err.code === 'P2025') return send(res, 404, 'NOT_FOUND', 'Record not found.');
    console.error('DB_ERROR', err.code, err.message);
    return send(res, 500, 'DB_ERROR', 'A database error occurred.');
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error('DB_UNAVAILABLE', err.message);
    return send(res, 503, 'DB_UNAVAILABLE', 'The database is temporarily unavailable.');
  }

  console.error('UNHANDLED_ERROR', err);
  return send(res, 500, 'INTERNAL_ERROR', 'Something went wrong on our side.');
}

module.exports = { notFound, errorHandler };