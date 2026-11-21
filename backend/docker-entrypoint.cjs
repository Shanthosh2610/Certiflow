const { execFileSync } = require('node:child_process');

execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' });

if (process.env.SEED_DEMO_DATA !== 'false') {
  execFileSync('npx', ['prisma', 'db', 'seed'], { stdio: 'inherit' });
}

require('./dist/server.js');
