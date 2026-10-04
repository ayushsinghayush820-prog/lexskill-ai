const prisma = require('../utils/prisma');

/**
 * Writes one append-only audit row. Never put passwords or submission text in metadata.
 * An audit failure is logged loudly but must not crash the user's request.
 */
async function audit({ req, institutionId, actorId, action, entityType, entityId, metadata }) {
  try {
    await prisma.auditLog.create({
      data: {
        institutionId: institutionId ?? req?.user?.institutionId ?? null,
        actorId: actorId ?? req?.user?.id ?? null,
        action,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        metadata: metadata ?? undefined,
        ip: req?.ip ?? null,
      },
    });
  } catch (err) {
    console.error('AUDIT_WRITE_FAILED', action, err.message);
  }
}

module.exports = { audit };