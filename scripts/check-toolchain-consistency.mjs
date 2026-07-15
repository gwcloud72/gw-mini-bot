import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const packageLock = JSON.parse(await readFile(path.join(projectRoot, 'package-lock.json'), 'utf8'));
const nodeVersion = (await readFile(path.join(projectRoot, '.node-version'), 'utf8')).trim();
const workflowText = await readFile(
  path.join(projectRoot, '.github/workflows/deploy.yml'),
  'utf8',
);
const validationErrors = [];
const expectedNodeVersion = '22.16.0';
const expectedNodeEngine = '22.16.x';
const expectedNpmEngine = '10.9.x';

if (nodeVersion !== expectedNodeVersion) {
  validationErrors.push(`.node-version은 ${expectedNodeVersion}이어야 합니다.`);
}

if (packageJson.engines?.node !== expectedNodeEngine) {
  validationErrors.push(`package.json engines.node는 ${expectedNodeEngine}이어야 합니다.`);
}

if (packageJson.engines?.npm !== expectedNpmEngine) {
  validationErrors.push(`package.json engines.npm은 ${expectedNpmEngine}이어야 합니다.`);
}

const lockRootEngines = packageLock.packages?.['']?.engines;
if (lockRootEngines?.node !== expectedNodeEngine) {
  validationErrors.push('package-lock.json의 Node.js engine이 package.json과 다릅니다.');
}

if (lockRootEngines?.npm !== expectedNpmEngine) {
  validationErrors.push('package-lock.json의 npm engine이 package.json과 다릅니다.');
}

if (!workflowText.includes(`node-version: ${expectedNodeVersion}`)) {
  validationErrors.push('GitHub Actions Node.js 버전이 .node-version과 다릅니다.');
}

const viteVersionRange = packageJson.devDependencies?.vite;
if (viteVersionRange !== '^8.1.4') {
  validationErrors.push('검증된 Vite 버전 범위는 ^8.1.4여야 합니다.');
}

const lockedViteVersion = packageLock.packages?.['node_modules/vite']?.version;
if (lockedViteVersion !== '8.1.4') {
  validationErrors.push('package-lock.json의 Vite 버전은 8.1.4여야 합니다.');
}

if (validationErrors.length > 0) {
  console.error(validationErrors.join('\n'));
  process.exit(1);
}

console.log('Vite·Node.js·npm 도구 버전 일관성 검사 통과');
