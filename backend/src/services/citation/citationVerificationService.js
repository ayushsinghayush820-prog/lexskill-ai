const env = require('../../config/env');
const prisma = require('../../utils/prisma');
const { audit } = require('../auditService');
const { extractCitations } = require('./citationExtractor');
const mockProvider = require('./providers/mockCitationProvider');
const noneProvider = require('./providers/noneCitationProvider');

// A provider is any object { name, isMock, verify(candidate) }. To add a REAL source later
// (a licensed database or an official API), write one provider file and register it here.
function getProvider() {
  if (env.CITATION_PROVIDER === 'mock') return mockProvider;
  if (env.CITATION_PROVIDER !== 'none') {
    console.warn(`Unknown CITATION_PROVIDER "${env.CITATION_PROVIDER}". Falling back to "none" (nothing is verified).`);
  }
  return noneProvider;
}

// Extracts and checks every authority in a submission. Runs once per submission (idempotent).
// A failure on one citation becomes CANNOT_CHECK; it never blocks the submission.
async function verifySubmissionCitations(submissionId, { institutionId, ip = null }) {
  if ((await prisma.citation.count({ where: { submissionId } })) > 0) return { skipped: true };
  const submission = await prisma.submission.findFirst({ where: { id: submissionId, institutionId }, select: { content: true } });
  if (!submission) return { skipped: true };

  const provider = getProvider();
  const rows = [];
  for (const c of extractCitations(submission.content)) {
    let r;
    try {
      r = await provider.verify(c);
    } catch (e) {
      r = { status: 'CANNOT_CHECK', normalized: null, sourceExcerpt: null, note: `Verification error: ${e.message.slice(0, 150)}` };
    }
    rows.push({
      submissionId,
      rawText: c.rawText.slice(0, 500),
      kind: c.kind,
      normalized: r.normalized ?? null,
      status: r.status,
      providerName: provider.name,
      isMock: provider.isMock,
      sourceExcerpt: r.sourceExcerpt ?? null,
      note: r.note ?? null,
    });
  }
  if (rows.length) await prisma.citation.createMany({ data: rows });
  await audit({
    institutionId, ip, action: 'CITATIONS_VERIFIED', entityType: 'Submission', entityId: submissionId,
    metadata: { count: rows.length, provider: provider.name, isMock: provider.isMock },
  });
  return { count: rows.length };
}

module.exports = { verifySubmissionCitations };