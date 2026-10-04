const app = require('./app');
const env = require('./config/env');
const prisma = require('./utils/prisma');

const server = app.listen(env.PORT, () => {
  console.log(`✅ LexSkill AI running at http://localhost:${env.PORT}`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);