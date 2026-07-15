import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'src');
const policyErrors = [];

async function listSourceFiles(directoryPath) {
  const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
  const sourceFiles = [];

  for (const directoryEntry of directoryEntries) {
    const entryPath = path.join(directoryPath, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      sourceFiles.push(...(await listSourceFiles(entryPath)));
    } else if (directoryEntry.isFile() && /\.(?:ts|tsx)$/.test(entryPath)) {
      sourceFiles.push(entryPath);
    }
  }

  return sourceFiles;
}

const forbiddenSourcePatterns = [
  { pattern: /style=\{\{/, label: 'JSX 인라인 style' },
  { pattern: /\.style\.[A-Za-z_$]/, label: 'DOM style 직접 변경' },
  { pattern: /setAttribute\(\s*['"]style['"]/, label: 'style 속성 직접 설정' },
];

for (const sourceFilePath of await listSourceFiles(sourceRoot)) {
  const sourceText = await readFile(sourceFilePath, 'utf8');
  for (const forbiddenPattern of forbiddenSourcePatterns) {
    if (forbiddenPattern.pattern.test(sourceText)) {
      policyErrors.push(
        `${forbiddenPattern.label} 금지: ${path.relative(projectRoot, sourceFilePath)}`,
      );
    }
  }
}

if (policyErrors.length > 0) {
  console.error(policyErrors.join('\n'));
  process.exit(1);
}

console.log('인라인 style 정책 검사 통과');
