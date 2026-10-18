const prisma = require('../utils/prisma');
const { DIMENSIONS } = require('../utils/skills');

// Several criteria can map to one skill dimension; SkillRecord stores one row per dimension.
function aggregateByDimension(rows) {
  const map = new Map();
  for (const r of rows) {
    const cur = map.get(r.skillDimension) || { skillDimension: r.skillDimension, score: 0, maxScore: 0 };
    cur.score += r.score;
    cur.maxScore += r.maxScore;
    map.set(r.skillDimension, cur);
  }
  return [...map.values()];
}

const pct = (score, max) => (max > 0 ? Math.round((score / max) * 1000) / 10 : null);
const sum = (arr, key) => arr.reduce((s, r) => s + r[key], 0);

// Official profile = faculty-finalised results whose result has been released to the student.
async function getStudentProfile(studentId, institutionId) {
  const records = await prisma.skillRecord.findMany({
    where: { studentId, institutionId, submission: { status: { in: ['RELEASED', 'REEVAL_REQUESTED'] } } },
    include: { submission: { select: { assessment: { select: { title: true } } } } },
    orderBy: { createdAt: 'asc' },
  });

  const dimensions = Object.entries(DIMENSIONS).map(([key, label]) => {
    const rs = records.filter((r) => r.skillDimension === key);
    return {
      dimension: key,
      label,
      percent: pct(sum(rs, 'score'), sum(rs, 'maxScore')),
      assessmentsCount: rs.length,
      history: rs.map((r) => ({
        submissionId: r.submissionId,
        assessmentTitle: r.submission.assessment.title,
        percent: pct(r.score, r.maxScore),
        date: r.createdAt,
      })),
    };
  });

  return {
    overallPercent: pct(sum(records, 'score'), sum(records, 'maxScore')),
    assessmentsCompleted: new Set(records.map((r) => r.submissionId)).size,
    dimensions,
    notice: 'Based only on faculty-finalised and released results.',
  };
}

module.exports = { aggregateByDimension, getStudentProfile };