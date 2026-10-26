// Starts the real server.py on a free port with its user data in a fresh temp dir.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function tempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'City_Rankings-'));
}

async function startServer(dataDir = tempDataDir()) {
  const port = await freePort();
  const proc = spawn('python3', ['server.py'], {
    cwd: ROOT,
    // Empty keys so a missing summary can never call the real Anthropic API.
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir,
           ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  proc.stderr.on('data', d => { stderr += d; });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error(`server.py exited early:\n${stderr}`);
    try { await fetch(url + '/coords.json'); break; } catch {}
    if (Date.now() > deadline) { proc.kill(); throw new Error(`server.py did not start:\n${stderr}`); }
    await new Promise(r => setTimeout(r, 50));
  }
  const stop = () => new Promise(resolve => {
    if (proc.exitCode !== null) return resolve();
    proc.once('exit', resolve);
    proc.kill();
  });
  return { url, port, dataDir, proc, stop, stderr: () => stderr };
}

module.exports = { ROOT, startServer, tempDataDir };
