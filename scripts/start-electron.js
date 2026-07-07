const { spawn } = require('child_process');
const electronPath = require('electron');

const childEnvironment = { ...process.env };
delete childEnvironment.ELECTRON_RUN_AS_NODE;

const electronProcess = spawn(electronPath, ['.'], {
  cwd: process.cwd(),
  env: childEnvironment,
  stdio: 'inherit',
  windowsHide: false
});

electronProcess.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

electronProcess.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
