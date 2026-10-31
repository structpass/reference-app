#!/usr/bin/env node
/**
 * Server Health Check Script
 * - Checks if frontend (port 3000) and backend (port 3001) are responding
 * - If frontend is down: kills stale process, clears .next cache, restarts
 * - If backend is down: restarts
 *
 * Usage: node scripts/health-check.js
 * Returns JSON with status for hook integration
 */

const { execSync, spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_PORT = 3000;
const BACKEND_PORT = 3001;

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(true);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function findPidOnPort(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port} | findstr LISTEN`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const match = output.match(/LISTENING\s+(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

function killProcess(pid) {
  try {
    execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function clearNextCache() {
  const nextDir = path.join(ROOT, 'packages', 'frontend', '.next');
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true, force: true });
    return true;
  }
  return false;
}

function startFrontend() {
  const child = spawn('pnpm', ['--filter', '@struct-pass/frontend', 'dev'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    shell: true,
  });
  child.unref();
}

function startBackend() {
  const child = spawn('pnpm', ['--filter', '@struct-pass/backend', 'start:dev'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    shell: true,
  });
  child.unref();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const results = { frontend: 'ok', backend: 'ok', actions: [] };

  // Check backend
  const backendAlive = await checkPort(BACKEND_PORT);
  if (!backendAlive) {
    const pid = findPidOnPort(BACKEND_PORT);
    if (pid) {
      killProcess(pid);
      results.actions.push(`Killed stale backend process (PID ${pid})`);
    }
    startBackend();
    results.actions.push('Restarted backend');
    results.backend = 'restarted';
  }

  // Check frontend
  const frontendAlive = await checkPort(FRONTEND_PORT);
  if (!frontendAlive) {
    const pid = findPidOnPort(FRONTEND_PORT);
    if (pid) {
      killProcess(pid);
      results.actions.push(`Killed stale frontend process (PID ${pid})`);
    }
    const cacheCleared = clearNextCache();
    if (cacheCleared) {
      results.actions.push('Cleared .next cache');
    }
    startFrontend();
    results.actions.push('Restarted frontend');
    results.frontend = 'restarted';
  }

  // Wait and verify if restarts happened
  if (results.actions.length > 0) {
    await sleep(10000);
    const frontendCheck = await checkPort(FRONTEND_PORT);
    const backendCheck = await checkPort(BACKEND_PORT);
    if (!frontendCheck) results.frontend = 'FAILED';
    if (!backendCheck) results.backend = 'FAILED';
  }

  // Output
  const allOk = results.frontend !== 'FAILED' && results.backend !== 'FAILED';
  console.log(
    JSON.stringify({
      success: allOk,
      frontend: results.frontend,
      backend: results.backend,
      actions: results.actions,
    }),
  );

  process.exit(allOk ? 0 : 1);
}

main();
