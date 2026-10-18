// Run with the server running:  node scripts/smoke-part2.js
const BASE = process.env.BASE_URL || 'http://localhost:4000';
const PASSWORD = 'Demo@12345'; // DEMO ONLY

async function call(method, path, { body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'lexskill',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const data = await res.json().catch(() => null);
  return { status: res.status, data, cookie: setCookie[0] ? setCookie[0].split(';')[0] : null };
}

let passed = 0;
let failed = 0;
function check(label, ok, info) {
  if (ok) { passed++; console.log('✅', label); }
  else { failed++; console.log('❌', label, info !== undefined ? JSON.stringify(info) : ''); }
}

async function login(email) {
  const r = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`Login failed for ${email}: ${JSON.stringify(r.data)}`);
  return r.cookie;
}

(async () => {
  const faculty = await login('faculty@demo.lexskill.test');
  const student1 = await login('student1@demo.lexskill.test');
  const admin = await login('admin@demo.lexskill.test');

  const cohorts = await call('GET', '/api/cohorts', { cookie: faculty });
  check('Faculty can list cohorts', cohorts.status === 200 && cohorts.data.cohorts.length > 0, cohorts.data);
  const cohortId = cohorts.data.cohorts[0].id;

  const payload = {
    title: `Legal Notice Drafting ${Date.now()} (DEMO)`,
    courseName: 'Drafting, Pleading & Conveyance (DEMO)',
    instructions:
      'Draft a legal notice on behalf of a tenant whose landlord has refused to return a security deposit for three months.',
    integrityMode: 'SUPERVISED',
    cohortId,
    criteria: [
      { name: 'Issue spotting', skillDimension: 'ISSUE_SPOTTING', maxScore: 10 },
      { name: 'Drafting quality', skillDimension: 'DRAFTING_QUALITY', maxScore: 10,
        descriptors: [{ label: 'Excellent', minScore: 8, maxScore: 10, text: 'Complete, well-structured notice with prayers.' }] },
    ],
  };

  const forbidden = await call('POST', '/api/assessments', { body: payload, cookie: student1 });
  check('Student cannot create assessments (403)', forbidden.status === 403, forbidden.data);

  const created = await call('POST', '/api/assessments', { body: payload, cookie: faculty });
  check('Faculty creates assessment with rubric (201)', created.status === 201 && created.data.assessment.totalMarks === 20, created.data);
  const id = created.data.assessment.id;

  const before = await call('GET', '/api/student/assessments', { cookie: student1 });
  check('Draft is NOT visible to students', !before.data.assessments.some((a) => a.id === id), before.data);

  const published = await call('POST', `/api/assessments/${id}/publish`, { cookie: faculty });
  check('Faculty publishes; students assigned', published.status === 200 && published.data.assignedCount === 5, published.data);

  const locked = await call('PATCH', `/api/assessments/${id}`, { body: { title: 'Changed after publish' }, cookie: faculty });
  check('Published assessment is locked (409)', locked.status === 409 && locked.data.error.code === 'ASSESSMENT_LOCKED', locked.data);

  const after = await call('GET', '/api/student/assessments', { cookie: student1 });
  check('Student sees published assessment', after.data.assessments.some((a) => a.id === id && a.myStatus === 'NOT_SUBMITTED'), after.data);

  const detail = await call('GET', `/api/student/assessments/${id}`, { cookie: student1 });
  check('Student opens assessment and sees criteria', detail.status === 200 && detail.data.assessment.criteria.length === 2, detail.data);

  const empty = await call('POST', `/api/student/assessments/${id}/submit`, { body: { content: '   ' }, cookie: student1 });
  check('Empty submission rejected (400)', empty.status === 400, empty.data);

  const text = 'To, The Landlord. Sub: Legal notice for refund of security deposit under the rent agreement dated 1 January 2026.';
  const submitted = await call('POST', `/api/student/assessments/${id}/submit`, { body: { content: text }, cookie: student1 });
  check('Student submits (201)', submitted.status === 201 && submitted.data.submission.status === 'SUBMITTED', submitted.data);

  const dup = await call('POST', `/api/student/assessments/${id}/submit`, { body: { content: text }, cookie: student1 });
  check('Duplicate submission blocked (409)', dup.status === 409 && dup.data.error.code === 'ALREADY_SUBMITTED', dup.data);

  const subs = await call('GET', `/api/assessments/${id}/submissions`, { cookie: faculty });
  check('Faculty sees 1 submission, 4 not submitted',
    subs.status === 200 && subs.data.submissions.length === 1 && subs.data.notSubmittedCount === 4, subs.data);

  const adminRead = await call('GET', '/api/assessments', { cookie: admin });
  check('Admin cannot read assessments (403)', adminRead.status === 403, adminRead.data);

  const newUser = await call('POST', '/api/admin/users', {
    cookie: admin,
    body: { name: 'Temp Student (DEMO)', email: `temp${Date.now()}@demo.lexskill.test`, role: 'STUDENT', password: 'Temp@123456', cohortId },
  });
  check('Admin creates a user; no password hash returned',
    newUser.status === 201 && newUser.data.user && !('passwordHash' in newUser.data.user), newUser.data);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Script error:', e.message); process.exit(1); });