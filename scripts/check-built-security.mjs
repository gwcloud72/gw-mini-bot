import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(projectRoot, 'dist');
const mode =
  process.env.GITHUB_ACTIONS === 'true' ||
  process.env.CF_PAGES === '1' ||
  process.env.VITE_APP_ENVIRONMENT === 'production'
    ? 'production'
    : 'development';
const environmentValues = {
  ...loadEnv(mode, projectRoot, ''),
  ...process.env,
};
const apiOrigin = new URL(environmentValues.VITE_API_ORIGIN).origin;
const indexHtml = await readFile(path.join(distRoot, 'index.html'), 'utf8');
const normalizedIndexHtml = indexHtml
  .replaceAll('&#39;', "'")
  .replaceAll('&quot;', '"')
  .replaceAll('&amp;', '&');
const securityErrors = [];

const contentSecurityPolicyMatches = normalizedIndexHtml.match(
  /http-equiv=["']Content-Security-Policy["']/g,
);
if (contentSecurityPolicyMatches?.length !== 1) {
  securityErrors.push('빌드 HTML에는 CSP meta가 정확히 하나 있어야 합니다.');
}

const requiredPolicyFragments = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'self'",
  `connect-src 'self' ${apiOrigin}`,
  "form-action 'self'",
];
for (const policyFragment of requiredPolicyFragments) {
  if (!normalizedIndexHtml.includes(policyFragment)) {
    securityErrors.push(`CSP 누락: ${policyFragment}`);
  }
}

if (environmentValues.VITE_APP_ENVIRONMENT === 'production') {
  if (!normalizedIndexHtml.includes('upgrade-insecure-requests')) {
    securityErrors.push('프로덕션 CSP에 upgrade-insecure-requests가 없습니다.');
  }

  if (normalizedIndexHtml.includes("'unsafe-inline'") || normalizedIndexHtml.includes("'unsafe-eval'")) {
    securityErrors.push('프로덕션 CSP에 unsafe-inline 또는 unsafe-eval이 포함됐습니다.');
  }
}

if (!/<meta[^>]+name=["']referrer["'][^>]+content=["']no-referrer["']/i.test(normalizedIndexHtml)) {
  securityErrors.push('no-referrer meta가 없습니다.');
}

if (/\sstyle=["']/i.test(normalizedIndexHtml)) {
  securityErrors.push('빌드 HTML에 인라인 style 속성이 있습니다.');
}

async function listFilesRecursively(directoryPath) {
  const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
  const filePaths = [];

  for (const directoryEntry of directoryEntries) {
    const entryPath = path.join(directoryPath, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      filePaths.push(...(await listFilesRecursively(entryPath)));
    } else if (directoryEntry.isFile()) {
      filePaths.push(entryPath);
    }
  }

  return filePaths;
}

const forbiddenPatterns = [
  /MODEL_API_KEY/,
  /DAILY_QUOTA_HASH_SECRET/,
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
  /AIza[0-9A-Za-z_-]{30,}/,
];

for (const filePath of await listFilesRecursively(distRoot)) {
  if (filePath.endsWith('.map')) {
    securityErrors.push(`source map 생성 금지: ${path.relative(distRoot, filePath)}`);
    continue;
  }

  if (!/\.(?:html|js|css|json|svg|txt)$/.test(filePath)) {
    continue;
  }

  const fileText = await readFile(filePath, 'utf8');
  for (const forbiddenPattern of forbiddenPatterns) {
    if (forbiddenPattern.test(fileText)) {
      securityErrors.push(`공개 산출물에 비밀값 패턴 발견: ${path.relative(distRoot, filePath)}`);
    }
  }
}

if (securityErrors.length > 0) {
  console.error(securityErrors.join('\n'));
  process.exit(1);
}

console.log('빌드 보안 검사 통과: CSP, referrer, source map, 비밀값 패턴 정상');
