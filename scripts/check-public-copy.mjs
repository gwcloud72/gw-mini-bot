import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = new URL('../dist/', import.meta.url);
const forbidden = [
  { label: 'provider brand', pattern: /gemini/i },
  { label: 'provider endpoint', pattern: /generativelanguage\.googleapis\.com/i },
  { label: 'provider auth header', pattern: /x-goog-api-key/i },
  { label: 'retired display name', pattern: /모아/ },
];
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.map']);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
    } else if (entry.isFile() && textExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

async function main() {
  const rootPath = root.pathname;

  try {
    await stat(rootPath);
  } catch {
    console.error('dist 디렉터리가 없습니다. 먼저 npm run build를 실행하세요.');
    process.exitCode = 1;
    return;
  }

  const findings = [];
  for (const file of await collectFiles(rootPath)) {
    const content = await readFile(file, 'utf8');
    for (const rule of forbidden) {
      if (rule.pattern.test(content)) {
        findings.push(`${relative(rootPath, file)}: ${rule.label}`);
      }
    }
  }

  if (findings.length) {
    console.error('공개 빌드에서 금지된 공급자 정보 또는 이전 표시 이름이 발견되었습니다.');
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('공개 빌드 검사 통과: 공급자 고유 정보와 이전 표시 이름이 없습니다.');
}

await main();
