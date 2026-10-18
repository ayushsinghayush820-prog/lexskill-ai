// Rule-based citation extraction (PDR Part 10: "existence checks must not depend on the model").
// Finds case names, SCC/AIR/INSC reporter cites, "Section X of the ... Act", and Constitution articles.
// It is deliberately conservative: unusual formats are simply not extracted.
const MAX_CITATIONS = 25;

const NAME_WORD = "[A-Z][A-Za-z.'’&\\-]*";
const NAME_PART = `${NAME_WORD}(?:\\s+(?:of|and|the|&|${NAME_WORD})){0,5}`;
const CASE_RE = new RegExp(`\\b(${NAME_PART})\\s+vs?\\.?\\s+(${NAME_PART})`, 'g');

const REPORTER_RES = [
  /\(\s*\d{4}\s*\)\s*\d{1,3}\s*SCC\s*\d{1,5}/g,
  /\bAIR\s*\d{4}\s*(?:SC|Del|Bom|Cal|Mad|All|Ker|Raj|Pat|Kar|P&H|Guj|MP|Ori|AP|Gau)\s*\d{1,5}/g,
  /\b\d{4}\s*INSC\s*\d{1,5}\b/g,
];
const SECTION_RE =
  /\b(?:Section|Sec\.|S\.)\s*(\d{1,3}[A-Z]?)(?:\s*\([^)]{1,6}\))*\s*,?\s*(?:of|under)\s+the\s+([A-Z][A-Za-z&' ]{2,70}?(?:Act|Code|Sanhita)(?:,?\s*\d{4})?)/g;
const ARTICLE_RE =
  /\bArticles?\s+(\d{1,3}[A-Z]?)(?:\s*\([^)]{1,6}\))*(?:\s*of\s+the\s+Constitution(?:\s+of\s+India)?)?/g;

const clean = (s) => s.replace(/\s+/g, ' ').replace(/[\s.,;:]+$/, '').trim();
// Sentence-start words that get glued onto case names ("Also Donoghue v. Stevenson").
const LEAD = /^(?:Also|See|Cf|Held|In|As|And|But|Per|Reliance|Further|Moreover|Thus|Hence|Similarly)\s+/;
const cleanCaseName = (s) => {
  let n = clean(s);
  while (LEAD.test(n)) n = n.replace(LEAD, '');
  return n;
};

function extractCitations(text) {
  const found = [];
  const reporters = [];
  for (const re of REPORTER_RES) {
    for (const m of text.matchAll(re)) {
      reporters.push({ start: m.index, end: m.index + m[0].length, raw: m[0].replace(/\s+/g, ' '), used: false });
    }
  }
  reporters.sort((a, b) => a.start - b.start);

  for (const m of text.matchAll(CASE_RE)) {
    let end = m.index + m[0].length;
    const name = cleanCaseName(m[0]);
    const rep = reporters.find(
      (r) => !r.used && r.start >= end && r.start - end <= 20 && /^[\s,]*$/.test(text.slice(end, r.start))
    );
    if (rep) {
      rep.used = true;
      end = rep.end;
    }
    found.push({
      kind: 'CASE',
      rawText: rep ? `${name} ${rep.raw}` : name,
      reporter: rep ? rep.raw : null,
      start: m.index,
      end,
    });
  }
  for (const r of reporters) {
    if (!r.used) found.push({ kind: 'REPORTER', rawText: r.raw, reporter: r.raw, start: r.start, end: r.end });
  }
  for (const m of text.matchAll(SECTION_RE)) {
    found.push({ kind: 'STATUTE', rawText: clean(m[0]), section: m[1], act: clean(m[2]), start: m.index, end: m.index + m[0].length });
  }
  for (const m of text.matchAll(ARTICLE_RE)) {
    found.push({ kind: 'CONSTITUTION', rawText: clean(m[0]), article: m[1], start: m.index, end: m.index + m[0].length });
  }

  found.sort((a, b) => a.start - b.start);
  const seen = new Set();
  const out = [];
  for (const f of found) {
    const key = f.rawText.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...f,
      context: text.slice(Math.max(0, f.start - 160), Math.min(text.length, f.end + 160)).replace(/\s+/g, ' '),
    });
    if (out.length >= MAX_CITATIONS) break;
  }
  return out;
}

module.exports = { extractCitations, MAX_CITATIONS };