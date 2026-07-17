import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const distributionRoot = new URL('../dist/', import.meta.url);
const forbiddenPublicPatterns = [
  { label: '백엔드 모델 비밀 계약', pattern: /\bMODEL_[A-Z0-9_]+\b/ },
  { label: '일일 한도 비밀 계약', pattern: /\bDAILY_QUOTA_HASH_SECRET\b/ },
  { label: '모델 공급자 이름', pattern: /\bgemini\b/i },
  {
    label: '모델 공급자 endpoint',
    pattern: /generativelanguage\.googleapis\.com/i,
  },
  { label: '모델 인증 헤더', pattern: /x-goog-api-key/i },
  { label: '이전 표시 이름', pattern: /모아/ },
];
const textExtensions = new Set([
  '.html',
  '.js',
  '.css',
  '.json',
  '.svg',
  '.txt',
  '.map',
]);

async function collectFiles(directoryPath) {
  const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
  const collectedFiles = [];

  for (const directoryEntry of directoryEntries) {
    const entryPath = join(directoryPath, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      collectedFiles.push(...(await collectFiles(entryPath)));
    } else if (
      directoryEntry.isFile() &&
      textExtensions.has(extname(directoryEntry.name))
    ) {
      collectedFiles.push(entryPath);
    }
  }

  return collectedFiles;
}

async function main() {
  const distributionRootPath = distributionRoot.pathname;

  try {
    await stat(distributionRootPath);
  } catch {
    console.error('dist 디렉터리가 없습니다. 먼저 npm run build를 실행하세요.');
    process.exitCode = 1;
    return;
  }

  const findings = [];
  for (const filePath of await collectFiles(distributionRootPath)) {
    const fileText = await readFile(filePath, 'utf8');
    for (const forbiddenPublicPattern of forbiddenPublicPatterns) {
      if (forbiddenPublicPattern.pattern.test(fileText)) {
        findings.push(
          `${relative(distributionRootPath, filePath)}: ${forbiddenPublicPattern.label}`,
        );
      }
    }
  }

  if (findings.length > 0) {
    console.error('공개 빌드에서 백엔드 비밀 계약 또는 이전 표시 이름이 발견되었습니다.');
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('공개 빌드 검사 통과: 백엔드 비밀 계약과 이전 표시 이름이 없습니다.');
}

await main();
