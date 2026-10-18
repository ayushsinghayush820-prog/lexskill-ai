const { verifySubmissionCitations } = require('./citation/citationVerificationService');
const { queueEvaluation } = require('./evaluationService');

// Runs after a student submits. In-process for the MVP (no queue server needed).
// If the server restarts mid-run, faculty can simply press "Retry AI" (a stale PENDING is detected).
function runAfterSubmission({ submissionId, institutionId, ip }) {
  setImmediate(async () => {
    try {
      await verifySubmissionCitations(submissionId, { institutionId, ip });
    } catch (e) {
      console.error('CITATION_PIPELINE_FAILED', e.message);
    }
    try {
      await queueEvaluation(submissionId, { institutionId, ip });
    } catch (e) {
      console.error('AI_PIPELINE_FAILED', e.message);
    }
  });
}

module.exports = { runAfterSubmission };