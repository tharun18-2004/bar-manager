import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

function withDefaultEnv(overrides = {}) {
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    NEXT_TELEMETRY_DISABLED: '1',
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) {
      delete env[key];
      continue;
    }
    env[key] = value;
  }

  return env;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPort(port, host = '127.0.0.1', timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const isOpen = await new Promise((resolve) => {
      const socket = new net.Socket();
      const done = (value) => {
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(1000);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(port, host);
    });

    if (isOpen) return;
    await sleep(300);
  }

  throw new Error(`Timed out waiting for TCP port ${host}:${port}`);
}

async function waitForApiJsonReady(port, timeoutMs = 60000) {
  const startedAt = Date.now();
  const url = `http://127.0.0.1:${port}/api/health`;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' });
      const contentType = response.headers.get('content-type') || '';
      if (contentType.toLowerCase().includes('application/json')) {
        return;
      }
    } catch {
      // Keep retrying until timeout.
    }

    await sleep(300);
  }

  throw new Error(`Timed out waiting for JSON API readiness at ${url}`);
}

export async function startNextDevServer(port, envOverrides = {}) {
  const env = withDefaultEnv(envOverrides);
  let startupLogs = '';

  const processRef =
    process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', `npm run dev -- --port ${port} --turbo`], {
          cwd: process.cwd(),
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn('npm', ['run', 'dev', '--', '--port', String(port), '--turbo'], {
          cwd: process.cwd(),
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

  processRef.stdout?.on('data', (chunk) => {
    startupLogs += chunk.toString();
  });
  processRef.stderr?.on('data', (chunk) => {
    startupLogs += chunk.toString();
  });

  const startupTimeoutMs = Number(env.NEXT_DEV_START_TIMEOUT_MS ?? 90000);
  let exited = false;
  processRef.once('exit', () => {
    exited = true;
  });

  const startedAt = Date.now();
  while (!exited && Date.now() - startedAt < startupTimeoutMs) {
    try {
      await waitForPort(port, '127.0.0.1', 2000);
      await waitForApiJsonReady(port, 5000);
      return processRef;
    } catch {
      // Retry until timeout.
    }
    await sleep(500);
  }

  stopNextDevServer(processRef);
  if (exited) {
    throw new Error(`Next.js dev server exited before startup on port ${port}.\n${startupLogs}`.trim());
  }
  throw new Error(
    `Timed out waiting for TCP port 127.0.0.1:${port} after ${startupTimeoutMs}ms.\n${startupLogs}`.trim()
  );
}

export function stopNextDevServer(processRef) {
  if (!processRef) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(processRef.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }

  processRef.kill('SIGTERM');
}
