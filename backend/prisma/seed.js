require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'Demo@12345'; // DEMO ONLY

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data in production.');
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const institution = await prisma.institution.upsert({
    where: { slug: 'demo-law-school' },
    update: {},
    create: { name: 'Demo National Law School (DEMO DATA)', slug: 'demo-law-school' },
  });

  const cohortName = 'Semester 4 – Drafting (DEMO)';
  const cohort = await prisma.cohort.upsert({
    where: { institutionId_name: { institutionId: institution.id, name: cohortName } },
    update: {},
    create: { institutionId: institution.id, name: cohortName },
  });

  const staff = [
    { role: 'ADMIN', email: 'admin@demo.lexskill.test', name: 'Registrar Demo (DEMO)' },
    { role: 'DEAN', email: 'dean@demo.lexskill.test', name: 'Dean R. Kulkarni (DEMO)' },
    { role: 'FACULTY', email: 'faculty@demo.lexskill.test', name: 'Prof. Meera Iyer (DEMO)' },
  ];
  for (const s of staff) {
    await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { ...s, institutionId: institution.id, passwordHash },
    });
  }

  const students = ['Aarav Sharma', 'Diya Menon', 'Rohan Verma', 'Ananya Rao', 'Kabir Singh'];
  for (let i = 0; i < students.length; i++) {
    const email = `student${i + 1}@demo.lexskill.test`;
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        role: 'STUDENT',
        email,
        name: `${students[i]} (DEMO)`,
        studentNumber: `DEMO-00${i + 1}`,
        institutionId: institution.id,
        cohortId: cohort.id,
        passwordHash,
      },
    });
  }

  console.log('✅ DEMO DATA seeded. All demo passwords: ' + DEMO_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());