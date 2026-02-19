import { spawn, spawnSync } from 'node:child_process';

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

async function waitForServer(url, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for Next.js server at ${url}`);
}

export async function startNextDevServer(port, envOverrides = {}) {
  const env = withDefaultEnv(envOverrides);

  const processRef =
    process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', `npm run dev -- --port ${port}`], {
          cwd: process.cwd(),
          env,
          stdio: 'ignore',
        })
      : spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
          cwd: process.cwd(),
          env,
          stdio: 'ignore',
        });

  await waitForServer(`http://127.0.0.1:${port}/`);
  return processRef;
}

export function stopNextDevServer(processRef) {
  if (!processRef) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(processRef.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }

  processRef.kill('SIGTERM');
}
