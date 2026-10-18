// DEMO / MOCK VERIFICATION. This is NOT real legal verification.
// It checks a tiny hand-written sample list so the product can be demonstrated.
// Every result is labelled DEMO and stored with isMock = true.
// Replace it with a real provider once a licensed or official source is agreed (PDR Part 8).
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const DEMO = 'DEMO verification: no real legal source was consulted.';

const CASES = [
  { name: 'kesavananda bharati v state of kerala', cites: ['(1973) 4 SCC 225', 'AIR 1973 SC 1461'],
    topics: ['basic structure', 'constitution', 'amend', 'article 368', 'fundamental rights'] },
  { name: 'maneka gandhi v union of india', cites: ['(1978) 1 SCC 248', 'AIR 1978 SC 597'],
    topics: ['article 21', 'article 14', 'article 19', 'personal liberty', 'passport', 'natural justice', 'procedure established by law', 'arbitrary'] },
  { name: 'vishaka v state of rajasthan', cites: ['(1997) 6 SCC 241', 'AIR 1997 SC 3011'],
    topics: ['sexual harassment', 'workplace', 'article 21', 'article 14', 'article 19', 'guidelines'] },
].map((c) => ({ ...c, cites: c.cites.map(squash) }));

// Deliberately fictitious authorities, used to demonstrate the NOT_FOUND label.
const DEMO_FAKES = ['ramesh kumar v state of delhi', 'sharma v union bank of bharat'];

const ACTS = {
  'indian contract act': 266, 'transfer of property act': 137, 'negotiable instruments act': 148,
  'code of civil procedure': 158, 'bharatiya nyaya sanhita': 358, 'limitation act': 32, 'specific relief act': 44,
};

const result = (status, note, normalized = null) => ({ status, normalized, sourceExcerpt: DEMO, note });

function verifyCase(c) {
  const nameN = norm(c.rawText);
  if (DEMO_FAKES.some((f) => nameN.includes(f))) {
    return result('NOT_FOUND', 'DEMO: matches a deliberately fictitious entry in the demo list.');
  }
  const byName = CASES.find((k) => nameN.includes(k.name));
  const byCite = CASES.find((k) => k.cites.some((x) => squash(c.rawText).includes(x)));
  if (byName) {
    if (c.reporter && !byName.cites.includes(squash(c.reporter))) {
      return result('FOUND_MISMATCH', 'DEMO: case name exists but the reporter citation differs.', byName.name);
    }
    const ctx = (c.context || '').toLowerCase();
    if (!byName.topics.some((t) => ctx.includes(t))) {
      return result('FOUND_UNSUPPORTED', 'DEMO heuristic: case exists but the surrounding text does not mention its subject matter.', byName.name);
    }
    return result('VERIFIED', 'DEMO: name and citation match the sample list.', byName.name);
  }
  if (byCite) {
    return c.kind === 'CASE'
      ? result('FOUND_MISMATCH', 'DEMO: this reporter citation belongs to a different case.', byCite.name)
      : result('VERIFIED', 'DEMO: reporter citation exists (case name not given).', byCite.name);
  }
  return result('CANNOT_CHECK', 'DEMO: not in the small sample list. Check manually.');
}

function verifyStatute(c) {
  const key = norm(c.act).replace(/\s*\d{4}\s*$/, '').trim();
  const max = ACTS[key];
  if (!max) return result('CANNOT_CHECK', 'DEMO: Act not in the sample list. Check manually.');
  const n = parseInt(c.section, 10);
  return n <= max
    ? result('VERIFIED', 'DEMO: Act and section number exist (existence only; the text was not checked).', `${key} s.${c.section}`)
    : result('NOT_FOUND', `DEMO: section ${n} is beyond the ${max} sections of this Act.`);
}

function verifyArticle(c) {
  return parseInt(c.article, 10) <= 395
    ? result('VERIFIED', 'DEMO: article number exists (existence only).', `constitution art.${c.article}`)
    : result('NOT_FOUND', 'DEMO: article number is beyond the Constitution range.');
}

module.exports = {
  name: 'demo-mock',
  isMock: true,
  async verify(c) {
    if (c.kind === 'CASE' || c.kind === 'REPORTER') return verifyCase(c);
    if (c.kind === 'STATUTE') return verifyStatute(c);
    if (c.kind === 'CONSTITUTION') return verifyArticle(c);
    return result('CANNOT_CHECK', 'DEMO: unsupported citation type.');
  },
};