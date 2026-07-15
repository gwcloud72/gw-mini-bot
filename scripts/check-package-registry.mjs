import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockFilePath = path.join(projectRoot, 'package-lock.json');
const npmConfigPath = path.join(projectRoot, '.npmrc');
const expectedRegistryOrigin = 'https://registry.npmjs.org';
const validationErrors = [];

const lockFileText = await readFile(lockFilePath, 'utf8');
const lockFileData = JSON.parse(lockFileText);
const npmConfigText = await readFile(npmConfigPath, 'utf8');
const resolvedPackageUrls = [];

if (lockFileData.lockfileVersion !== 3) {
  validationErrors.push('package-lock.json은 lockfileVersion 3이어야 합니다.');
}

for (const [packagePath, packageMetadata] of Object.entries(lockFileData.packages ?? {})) {
  if (!packageMetadata || typeof packageMetadata !== 'object') {
    continue;
  }

  const resolvedValue = packageMetadata.resolved;
  if (typeof resolvedValue !== 'string') {
    continue;
  }

  resolvedPackageUrls.push(resolvedValue);

  try {
    const resolvedUrl = new URL(resolvedValue);
    if (resolvedUrl.origin !== expectedRegistryOrigin) {
      validationErrors.push(`${packagePath || '<root>'} resolved host가 공개 npm registry가 아닙니다.`);
    }
    if (resolvedUrl.protocol !== 'https:') {
      validationErrors.push(`${packagePath || '<root>'} resolved URL은 HTTPS여야 합니다.`);
    }
  } catch {
    validationErrors.push(`${packagePath || '<root>'} resolved 값이 올바른 URL이 아닙니다.`);
  }
}

if (resolvedPackageUrls.length === 0) {
  validationErrors.push('package-lock.json에서 resolved URL을 찾지 못했습니다.');
}

const npmConfigLines = npmConfigText
  .split(/\r?\n/)
  .map((lineText) => lineText.trim())
  .filter(Boolean);
const registryLine = npmConfigLines.find((lineText) => lineText.startsWith('registry='));

if (registryLine !== `registry=${expectedRegistryOrigin}/`) {
  validationErrors.push('.npmrc registry는 공개 npm registry로 고정해야 합니다.');
}

if (!npmConfigLines.includes('replace-registry-host=never')) {
  validationErrors.push('.npmrc에서 lockfile registry host 교체를 차단해야 합니다.');
}

if (/(?:_auth|_authToken|password|username)\s*=/i.test(npmConfigText)) {
  validationErrors.push('.npmrc에 인증정보를 저장할 수 없습니다.');
}

if (validationErrors.length > 0) {
  console.error(validationErrors.join('\n'));
  process.exit(1);
}

console.log(`공개 npm registry lock 검증 통과 (${resolvedPackageUrls.length}개 패키지 URL)`);
