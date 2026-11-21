const { spawn } = require('child_process');
const path = require('path');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

console.log('====================================================');
console.log('🚀 Launching CertiFlow Fullstack Development Environment');
console.log('====================================================');

const backend = spawn(npmCmd, ['run', 'dev'], {
  cwd: path.join(__dirname, '..', 'backend'),
  stdio: 'inherit',
  shell: true,
});

const frontend = spawn(npmCmd, ['run', 'dev'], {
  cwd: path.join(__dirname, '..', 'frontend'),
  stdio: 'inherit',
  shell: true,
});

const cleanExit = () => {
  console.log('\nStopping CertiFlow services...');
  if (backend && !backend.killed) {
    if (isWindows) {
      spawn('taskkill', ['/pid', backend.pid, '/f', '/t']);
    } else {
      backend.kill('SIGINT');
    }
  }
  if (frontend && !frontend.killed) {
    if (isWindows) {
      spawn('taskkill', ['/pid', frontend.pid, '/f', '/t']);
    } else {
      frontend.kill('SIGINT');
    }
  }
  process.exit();
};

process.on('SIGINT', cleanExit);
process.on('SIGTERM', cleanExit);
