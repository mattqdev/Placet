#!/usr/bin/env node
'use strict';

// Simulates a full AI task lifecycle by POSTing synthetic TaskEvents
// straight to a running Placet instance's local server — no Claude Code /
// opencode session involved, so it costs zero AI provider tokens. Use it to
// exercise the sidebar UI and the approve-to-commit flow. See TESTING.md.

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const VALID_SOURCES = ['claude-code', 'opencode'];

function parseArgs(argv) {
  const args = { dir: process.cwd(), source: 'claude-code', title: 'Simulated task', files: [], delayMs: 600 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--dir':
        args.dir = argv[++i];
        break;
      case '--source':
        args.source = argv[++i];
        break;
      case '--title':
        args.title = argv[++i];
        break;
      case '--files':
        args.files = (argv[++i] || '')
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean);
        break;
      case '--delay':
        args.delayMs = Number(argv[++i]);
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}\n`);
        printHelp();
        process.exit(1);
    }
  }

  if (!VALID_SOURCES.includes(args.source)) {
    console.error(`--source must be one of: ${VALID_SOURCES.join(', ')}`);
    process.exit(1);
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/simulate-task.js [options]

Simulates a full AI task lifecycle (thinking -> coding -> testing -> completed)
by POSTing synthetic TaskEvents straight to a running Placet instance's local
server. No Claude Code / opencode session is involved — zero tokens spent.

Options:
  --dir <path>     Workspace root to read .placet/server.json from (default: cwd)
  --source <name>  "claude-code" or "opencode" (default: claude-code)
  --title <text>   Task title shown in the sidebar (default: "Simulated task")
  --files <a,b,c>  Comma-separated file paths to report as touched (default: none)
  --delay <ms>     Delay between lifecycle steps (default: 600)
  -h, --help       Show this help

Requires: the Placet extension already running (F5 Extension Development
Host) with --dir open as its workspace folder, so .placet/server.json exists.

Example — from a scratch git repo where you've made real, uncommitted edits
to a.txt and b.txt (make those edits yourself first, no AI needed):
  node /path/to/Placet/scripts/simulate-task.js --dir . --files a.txt,b.txt --title "Refactor auth"

Then click the sidebar's 👍 on "Refactor auth" to exercise the real
approve-to-commit flow (scoped diff, commit message generation, confirmation
panel) against those two files.
`);
}

function readDiscovery(dir) {
  const file = path.join(dir, '.placet', 'server.json');
  if (!fs.existsSync(file)) {
    console.error(
      `No ${file} found. Is the Placet Extension Development Host running with "${dir}" open as its workspace folder?`
    );
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function postEvent(discovery, event) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(event);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: discovery.port,
        path: '/events',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${discovery.token}`,
        },
      },
      (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Placet server responded ${res.statusCode}`));
        } else {
          resolve();
        }
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const discovery = readDiscovery(args.dir);
  const sessionId = `simulate-${Date.now()}`;
  const taskId = `${sessionId}:task`;

  const steps = [
    { status: 'thinking', files: [] },
    { status: 'coding', files: args.files },
    { status: 'testing', files: args.files },
    { status: 'completed', files: args.files },
  ];

  for (const step of steps) {
    console.log(`-> ${step.status}${step.files.length ? ` (${step.files.join(', ')})` : ''}`);
    await postEvent(discovery, {
      source: args.source,
      sessionId,
      taskId,
      title: args.title,
      status: step.status,
      filesTouched: step.files,
      timestamp: Date.now(),
    });
    await sleep(args.delayMs);
  }

  console.log(
    `\nDone. "${args.title}" should now show as completed in the Placet sidebar, ${args.files.length} file(s) touched.`
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
