import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./release-utils.mjs', import.meta.url));
const version = '1.2.3';
const installer = `OpenCode Session Manager_${version}_x64-setup.exe`;
const payload = Buffer.from('synthetic installer fixture');
const digest = createHash('sha256').update(payload).digest('hex');

function fixture(context) {
  const root = mkdtempSync(join(tmpdir(), 'release-utils-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src-tauri'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'opencode-session-manager', version }));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ version, packages: { '': { version } } }));
  writeFileSync(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ version }));
  writeFileSync(join(root, 'src-tauri/Cargo.toml'), `[package]\nname = "opencode-session-manager"\nversion = "${version}"\n\n[dependencies]\nversion = "9.8.7"\n`);
  writeFileSync(join(root, 'src-tauri/Cargo.lock'), `version = 4\n\n[[package]]\nname = "dependency"\nversion = "9.8.7"\n\n[[package]]\nname = "opencode-session-manager"\nversion = "${version}"\n\n[[package]]\nname = "another"\nversion = "8.7.6"\n`);
  mkdirSync(join(root, 'bundle'));
  writeFileSync(join(root, 'bundle', installer), payload);
  return root;
}

function run(root, ...args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
}

test('validates matching stable tag when all scoped versions agree', (context) => {
  const root = fixture(context);
  const result = run(root, 'validate', 'v1.2.3');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), version);
});

test('validates internal versions when manual build has no tag', (context) => {
  const root = fixture(context);
  const result = run(root, 'validate');
  assert.equal(result.status, 0, result.stderr);
});

for (const tag of ['v1.2.4', '1.2.3', 'v01.2.3', 'v1.02.3', 'v1.2.03', 'v1.2', 'v1.2.3-beta.1', 'v1.2.3+build', 'v1.2.3\n', 'v1.2.3;echo unsafe', '']) {
  test(`rejects tag when input is ${JSON.stringify(tag)}`, (context) => {
    const root = fixture(context);
    const result = run(root, 'validate', tag);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /tag|version/i);
  });
}

for (const field of ['package', 'lock', 'lockRoot', 'tauri', 'cargo', 'cargoLock']) {
  test(`rejects version drift when ${field} differs`, (context) => {
    const root = fixture(context);
    const files = {
      package: ['package.json', { version: '1.2.4' }],
      lock: ['package-lock.json', { version: '1.2.4', packages: { '': { version } } }],
      lockRoot: ['package-lock.json', { version, packages: { '': { version: '1.2.4' } } }],
      tauri: ['src-tauri/tauri.conf.json', { version: '1.2.4' }],
      cargo: ['src-tauri/Cargo.toml', '[package]\nname = "opencode-session-manager"\nversion = "1.2.4"\n'],
      cargoLock: ['src-tauri/Cargo.lock', '[[package]]\nname = "opencode-session-manager"\nversion = "1.2.4"\n'],
    };
    const [path, data] = files[field];
    writeFileSync(join(root, path), typeof data === 'string' ? data : JSON.stringify(data));
    const result = run(root, 'validate');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /version/i);
  });
}

test('rejects missing root lock version when dependency version exists', (context) => {
  const root = fixture(context);
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ version, packages: { dependency: { version } } }));
  const result = run(root, 'validate');
  assert.equal(result.status, 1);
});

test('rejects missing own Cargo.lock entry when another version matches', (context) => {
  const root = fixture(context);
  writeFileSync(join(root, 'src-tauri/Cargo.lock'), `[[package]]\nname = "dependency"\nversion = "${version}"\n`);
  const result = run(root, 'validate');
  assert.equal(result.status, 1);
});

test('accepts scoped TOML strings when comments and CRLF are present', (context) => {
  const root = fixture(context);
  writeFileSync(join(root, 'src-tauri/Cargo.toml'), `[package] # app\r\nname = 'opencode-session-manager'\r\nversion = '${version}' # release\r\n[lib]\r\nversion = "9.8.7"\r\n`);
  const result = run(root, 'validate');
  assert.equal(result.status, 0, result.stderr);
});

test('prepares only installer and basename checksum when bundle is valid', (context) => {
  const root = fixture(context);
  writeFileSync(join(root, 'bundle/private.txt'), 'not a release asset');
  const result = run(root, 'prepare', 'bundle');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), installer);
  assert.deepEqual(readdirSync(join(root, 'release-assets')).sort(), [installer, 'SHA256SUMS.txt'].sort());
  assert.deepEqual(readFileSync(join(root, 'release-assets', installer)), payload);
  assert.equal(readFileSync(join(root, 'release-assets/SHA256SUMS.txt'), 'utf8'), `${digest}  ${installer}\n`);
});

for (const condition of ['missing', 'extra', 'wrongVersion', 'wrongArch', 'empty', 'directory']) {
  test(`rejects bundle when installer is ${condition}`, (context) => {
    const root = fixture(context);
    if (condition !== 'extra') rmSync(join(root, 'bundle', installer));
    if (condition === 'extra') writeFileSync(join(root, 'bundle/other.exe'), payload);
    if (condition === 'wrongVersion') writeFileSync(join(root, 'bundle/OpenCode Session Manager_1.2.4_x64-setup.exe'), payload);
    if (condition === 'wrongArch') writeFileSync(join(root, 'bundle/OpenCode Session Manager_1.2.3_arm64-setup.exe'), payload);
    if (condition === 'empty') writeFileSync(join(root, 'bundle', installer), '');
    if (condition === 'directory') mkdirSync(join(root, 'bundle', installer));
    const result = run(root, 'prepare', 'bundle');
    assert.equal(result.status, 1);
  });
}

test('verifies downloaded assets when checksum matches', (context) => {
  const root = fixture(context);
  assert.equal(run(root, 'prepare', 'bundle').status, 0);
  const result = run(root, 'verify', 'v1.2.3');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), installer);
});

for (const condition of ['tampered', 'path', 'extraLine', 'badHash', 'extraAsset', 'missingChecksum']) {
  test(`rejects downloaded assets when ${condition}`, (context) => {
    const root = fixture(context);
    assert.equal(run(root, 'prepare', 'bundle').status, 0);
    const sums = join(root, 'release-assets/SHA256SUMS.txt');
    if (condition === 'tampered') writeFileSync(join(root, 'release-assets', installer), 'modified');
    if (condition === 'path') writeFileSync(sums, `${digest}  ../${installer}\n`);
    if (condition === 'extraLine') writeFileSync(sums, `${digest}  ${installer}\n${digest}  extra.exe\n`);
    if (condition === 'badHash') writeFileSync(sums, `invalid  ${installer}\n`);
    if (condition === 'extraAsset') writeFileSync(join(root, 'release-assets/private.txt'), 'not publishable');
    if (condition === 'missingChecksum') rmSync(sums);
    const result = run(root, 'verify', 'v1.2.3');
    assert.equal(result.status, 1);
  });
}

test('shows usage when help is requested', () => {
  const result = run(tmpdir(), '--help');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validate.*prepare.*verify/s);
});

test('rejects unknown command when CLI input is invalid', () => {
  const result = run(tmpdir(), 'publish');
  assert.equal(result.status, 1);
});
