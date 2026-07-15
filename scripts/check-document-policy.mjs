import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const allowedMarkdownFiles = new Set(['update.md']);
const validationErrors = [];

async function collectFiles(relativeDirectory = '') {
  const absoluteDirectory = path.join(projectRoot, relativeDirectory);
  const directoryEntries = await readdir(absoluteDirectory, { withFileTypes: true });
  const collectedFiles = [];

  for (const directoryEntry of directoryEntries) {
    if (directoryEntry.isDirectory() && ignoredDirectories.has(directoryEntry.name)) {
      continue;
    }

    const relativePath = path.join(relativeDirectory, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      collectedFiles.push(...(await collectFiles(relativePath)));
    } else if (directoryEntry.isFile()) {
      collectedFiles.push(relativePath.split(path.sep).join('/'));
    }
  }

  return collectedFiles;
}

try {
  await access(path.join(projectRoot, 'update.md'));
} catch {
  validationErrors.push('루트 update.md가 없습니다.');
}

const updateText = await readFile(path.join(projectRoot, 'update.md'), 'utf8').catch(() => '');
for (const requiredHeading of ['# gw-mini-bot 업데이트', '## 누적 변경 이력', '## 문서 운영 규칙']) {
  if (!updateText.includes(requiredHeading)) {
    validationErrors.push(`update.md 필수 항목 누락: ${requiredHeading}`);
  }
}

for (const relativePath of await collectFiles()) {
  const normalizedPath = relativePath.toLowerCase();
  const fileName = path.posix.basename(relativePath);

  if (normalizedPath.startsWith('docs/')) {
    validationErrors.push(`별도 docs 폴더 금지: ${relativePath}`);
  }

  if (normalizedPath.endsWith('.md') && !allowedMarkdownFiles.has(relativePath)) {
    validationErrors.push(`update.md 외 Markdown 문서 금지: ${relativePath}`);
  }

  if (
    /(?:audit|validation).*\.(?:md|json|txt)$/i.test(fileName) ||
    /^(?:split_manifest\.json|repository_target\.md|package_contents\.txt)$/i.test(fileName)
  ) {
    validationErrors.push(`별도 감사·목록 산출물 금지: ${relativePath}`);
  }
}

if (validationErrors.length > 0) {
  console.error(validationErrors.join('\n'));
  process.exit(1);
}

console.log('문서 정책 검사 통과: 루트 update.md 하나만 유지됩니다.');
