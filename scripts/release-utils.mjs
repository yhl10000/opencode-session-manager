import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?![\s\S])/;
const packageName = 'opencode-session-manager';
const assetsDirectory = 'release-assets';

function tomlSections(text, heading) {
  const sections = [];
  let current;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) {
      current = line.replace(/\s*#.*$/, '').trim() === heading ? [] : undefined;
      if (current) sections.push(current);
    } else if (current) {
      current.push(line);
    }
  }
  return sections.map((lines) => lines.join('\n'));
}

function tomlString(section, key) {
  const matches = [...section.matchAll(new RegExp(`^\\s*${key}\\s*=\\s*(["'])([^"'\\r\\n]*)\\1\\s*(?:#.*)?$`, 'gm'))];
  if (matches.length !== 1) throw new Error(`Expected one TOML ${key} string`);
  return matches[0][2];
}

export function validateVersions(root, tag) {
  const json = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
  const packageJson = json('package.json');
  const lock = json('package-lock.json');
  const tauri = json('src-tauri/tauri.conf.json');
  const cargoSections = tomlSections(readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8'), '[package]');
  if (cargoSections.length !== 1) throw new Error('Expected one Cargo package version section');
  const ownPackages = tomlSections(readFileSync(join(root, 'src-tauri/Cargo.lock'), 'utf8'), '[[package]]')
    .filter((section) => tomlString(section, 'name') === packageName);
  if (ownPackages.length !== 1) throw new Error('Expected one own Cargo.lock package version entry');
  const versions = {
    'package.json': packageJson.version,
    'package-lock.json': lock.version,
    'package-lock.json packages[""]': lock.packages?.['']?.version,
    'tauri.conf.json': tauri.version,
    'Cargo.toml package': tomlString(cargoSections[0], 'version'),
    'Cargo.lock own package': tomlString(ownPackages[0], 'version'),
  };
  const version = packageJson.version;
  if (typeof version !== 'string' || !stableVersion.test(version)) throw new Error('Expected stable package version');
  for (const [source, value] of Object.entries(versions)) {
    if (value !== version) throw new Error(`Version mismatch: ${source} must equal ${version}`);
  }
  if (tag !== undefined && (typeof tag !== 'string' || !tag.startsWith('v') || !stableVersion.test(tag.slice(1)) || tag !== `v${version}`)) {
    throw new Error(`Tag must be the stable version v${version}`);
  }
  return version;
}

function installerName(version) {
  return `OpenCode Session Manager_${version}_x64-setup.exe`;
}

function installerBytes(directory, name) {
  const executables = readdirSync(directory, { withFileTypes: true }).filter((entry) => /\.exe$/i.test(entry.name));
  if (executables.length !== 1 || executables[0].name !== name || !executables[0].isFile()) {
    throw new Error(`Expected exactly one regular installer: ${name}`);
  }
  const bytes = readFileSync(join(directory, name));
  if (bytes.length === 0) throw new Error('Installer is empty');
  return bytes;
}

function checksum(bytes, name) {
  return `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`;
}

export function prepareAssets(root, bundleDirectory = 'src-tauri/target/release/bundle/nsis') {
  const name = installerName(validateVersions(root));
  const source = resolve(root, bundleDirectory);
  const bytes = installerBytes(source, name);
  const output = join(root, assetsDirectory);
  mkdirSync(output);
  copyFileSync(join(source, name), join(output, name));
  writeFileSync(join(output, 'SHA256SUMS.txt'), checksum(bytes, name));
  return name;
}

export function verifyAssets(root, tag) {
  const name = installerName(validateVersions(root, tag));
  const directory = join(root, assetsDirectory);
  const entries = readdirSync(directory, { withFileTypes: true });
  if (entries.length !== 2 || entries.some((entry) => !entry.isFile() || ![name, 'SHA256SUMS.txt'].includes(entry.name))) {
    throw new Error('Expected only the installer and SHA256SUMS.txt');
  }
  const bytes = installerBytes(directory, name);
  if (readFileSync(join(directory, 'SHA256SUMS.txt'), 'utf8') !== checksum(bytes, name)) {
    throw new Error('Installer SHA256 checksum or basename mismatch');
  }
  return name;
}

function main(args) {
  const [command, argument] = args;
  if (args.length > 2) throw new Error('Too many arguments');
  switch (command) {
    case '--help':
      console.log('Usage: release-utils.mjs validate [vX.Y.Z] | prepare [bundle-directory] | verify [vX.Y.Z]');
      break;
    case 'validate':
      console.log(validateVersions(process.cwd(), argument));
      break;
    case 'prepare':
      console.log(prepareAssets(process.cwd(), argument));
      break;
    case 'verify':
      console.log(verifyAssets(process.cwd(), argument));
      break;
    default:
      throw new Error('Unknown command; use --help');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  }
}
