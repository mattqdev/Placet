import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTmpRepo, writeFile, readFile } from './helpers/tmpRepo';
import { connectClaudeCode } from '../src/adapters/claudeCode/installer';
import { connectOpencode } from '../src/adapters/opencode/installer';
import type { Logger } from '../src/logger';

const fakeLogger = { info: () => {} } as unknown as Logger;

const FORWARDER_PATH = '/fake/install/dist/forwarder.js';

test('connectClaudeCode: writes UserPromptSubmit/PostToolUse/Stop hooks pointing at the forwarder', () => {
  const repo = createTmpRepo();
  try {
    connectClaudeCode(repo.root, FORWARDER_PATH, fakeLogger);

    const settings = JSON.parse(readFile(repo, path.join('.claude', 'settings.local.json')));
    for (const event of ['UserPromptSubmit', 'PostToolUse', 'Stop']) {
      assert.ok(settings.hooks[event], `${event} hook missing`);
      const command = settings.hooks[event][0].hooks[0].command;
      assert.ok(command.includes(FORWARDER_PATH));
      assert.ok(command.includes(event));
    }
    assert.equal(settings.hooks.PostToolUse[0].matcher, '*');
  } finally {
    repo.cleanup();
  }
});

test('connectClaudeCode: re-running updates in place instead of duplicating hook entries', () => {
  const repo = createTmpRepo();
  try {
    connectClaudeCode(repo.root, FORWARDER_PATH, fakeLogger);
    connectClaudeCode(repo.root, '/fake/install/v2/dist/forwarder.js', fakeLogger);

    const settings = JSON.parse(readFile(repo, path.join('.claude', 'settings.local.json')));
    assert.equal(settings.hooks.UserPromptSubmit.length, 1, 'must not duplicate the matcher entry');
    assert.ok(settings.hooks.UserPromptSubmit[0].hooks[0].command.includes('/fake/install/v2/'));
  } finally {
    repo.cleanup();
  }
});

test('connectClaudeCode: settings.local.json ends up gitignored (it embeds a machine-specific absolute path)', () => {
  const repo = createTmpRepo();
  try {
    connectClaudeCode(repo.root, FORWARDER_PATH, fakeLogger);
    const gitignore = readFile(repo, '.gitignore');
    assert.match(gitignore, /\.claude\/settings\.local\.json/);
  } finally {
    repo.cleanup();
  }
});

test('connectClaudeCode: preserves unrelated existing settings', () => {
  const repo = createTmpRepo();
  try {
    writeFile(repo, path.join('.claude', 'settings.local.json'), JSON.stringify({ someOtherSetting: true }));
    connectClaudeCode(repo.root, FORWARDER_PATH, fakeLogger);
    const settings = JSON.parse(readFile(repo, path.join('.claude', 'settings.local.json')));
    assert.equal(settings.someOtherSetting, true);
    assert.ok(settings.hooks.Stop);
  } finally {
    repo.cleanup();
  }
});

test('connectOpencode: copies the plugin template verbatim to .opencode/plugin/placet.ts', () => {
  const repo = createTmpRepo();
  try {
    const templatePath = path.resolve(process.cwd(), 'resources', 'opencode', 'placet-plugin.ts');
    const templateContent = fs.readFileSync(templatePath, 'utf8');

    connectOpencode(repo.root, templatePath, fakeLogger);

    const copied = readFile(repo, path.join('.opencode', 'plugin', 'placet.ts'));
    assert.equal(copied, templateContent);
  } finally {
    repo.cleanup();
  }
});

test('connectOpencode: does NOT touch .gitignore (the plugin has no machine-specific paths, safe to commit)', () => {
  const repo = createTmpRepo();
  try {
    const templatePath = path.resolve(process.cwd(), 'resources', 'opencode', 'placet-plugin.ts');
    connectOpencode(repo.root, templatePath, fakeLogger);
    assert.equal(fs.existsSync(path.join(repo.root, '.gitignore')), false);
  } finally {
    repo.cleanup();
  }
});
