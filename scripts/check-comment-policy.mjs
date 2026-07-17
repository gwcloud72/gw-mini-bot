import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import ts from 'typescript';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const violations = [];
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const sourceDirectories = ['src', 'shared', 'scripts'];
const rootCodeFiles = ['eslint.config.js', 'vite.config.ts', 'vitest.config.ts'];
const hashCommentFiles = ['.gitignore'];
const generatedLicensePattern =
  /^!\s*tailwindcss\s+v[^|]+\|\s*MIT License\s*\|\s*https:\/\/tailwindcss\.com\s*$/;
const forbiddenCommentPatterns = [
  { pattern: /\b(?:TODO|FIXME|HACK|XXX)\b/i, label: '미완료 작업 표식' },
  { pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/, label: 'Google API 키 형태' },
  {
    pattern:
      /\b(?:MODEL_API_KEY|DAILY_QUOTA_HASH_SECRET|GITHUB_TOKEN|CLOUDFLARE_API_TOKEN)\s*=/i,
    label: '민감 환경값 대입',
  },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: '개인키' },
  { pattern: /(?:\/mnt\/data|\/home\/oai|[A-Za-z]:\\Users\\)/i, label: '로컬 작업 경로' },
  { pattern: /sourceMappingURL\s*=/i, label: 'source map 참조' },
];

async function listFilesRecursively(relativeDirectory, allowMissing = false) {
  const absoluteDirectory = path.join(projectRoot, relativeDirectory);
  let entries;

  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch (directoryError) {
    if (
      allowMissing &&
      directoryError instanceof Error &&
      'code' in directoryError &&
      directoryError.code === 'ENOENT'
    ) {
      return [];
    }
    throw directoryError;
  }

  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(relativePath, allowMissing)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function getLineNumber(sourceText, position) {
  return sourceText.slice(0, position).split(/\r\n|\r|\n/).length;
}

function inspectComment(relativePath, commentText, lineNumber, allowLicense = false) {
  const normalizedComment = commentText.trim();
  if (allowLicense && generatedLicensePattern.test(normalizedComment)) {
    return;
  }

  for (const forbiddenCommentPattern of forbiddenCommentPatterns) {
    if (forbiddenCommentPattern.pattern.test(normalizedComment)) {
      violations.push(
        `${relativePath}:${lineNumber} 금지된 주석 내용: ${forbiddenCommentPattern.label}`,
      );
    }
  }
}

function collectCodeComments(sourceText, relativePath) {
  const extension = path.extname(relativePath);
  const scriptKind =
    extension === '.tsx'
      ? ts.ScriptKind.TSX
      : extension === '.jsx'
        ? ts.ScriptKind.JSX
        : extension === '.js' || extension === '.mjs' || extension === '.cjs'
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const commentsByRange = new Map();
  const recordComment = (position, end) => {
    commentsByRange.set(`${position}:${end}`, { position, text: sourceText.slice(position, end) });
  };
  const visitNode = (node) => {
    ts.forEachLeadingCommentRange(sourceText, node.getFullStart(), recordComment);
    ts.forEachTrailingCommentRange(sourceText, node.getEnd(), recordComment);
    ts.forEachChild(node, visitNode);
  };
  ts.forEachLeadingCommentRange(sourceText, 0, recordComment);
  visitNode(sourceFile);
  return [...commentsByRange.values()];
}

async function inspectCodeFile(relativePath) {
  const sourceText = await readFile(path.join(projectRoot, relativePath), 'utf8');
  for (const sourceComment of collectCodeComments(sourceText, relativePath)) {
    inspectComment(
      relativePath,
      sourceComment.text,
      getLineNumber(sourceText, sourceComment.position),
    );
  }
}

async function inspectCssFile(relativePath, allowGeneratedLicense) {
  const cssText = await readFile(path.join(projectRoot, relativePath), 'utf8');
  const cssRoot = postcss.parse(cssText, { from: relativePath });
  cssRoot.walkComments((commentNode) => {
    inspectComment(
      relativePath,
      commentNode.text,
      commentNode.source?.start?.line ?? 1,
      allowGeneratedLicense,
    );
  });
}

async function inspectMarkupFile(relativePath) {
  const markupText = await readFile(path.join(projectRoot, relativePath), 'utf8');
  for (const commentMatch of markupText.matchAll(/<!--[\s\S]*?-->/g)) {
    inspectComment(
      relativePath,
      commentMatch[0],
      getLineNumber(markupText, commentMatch.index ?? 0),
    );
  }
}

async function inspectHashCommentFile(relativePath) {
  const sourceText = await readFile(path.join(projectRoot, relativePath), 'utf8');
  sourceText.split(/\r\n|\r|\n/).forEach((lineText, lineIndex) => {
    const commentIndex = lineText.indexOf('#');
    if (commentIndex >= 0) {
      inspectComment(relativePath, lineText.slice(commentIndex), lineIndex + 1);
    }
  });
}

for (const sourceDirectory of sourceDirectories) {
  for (const relativePath of await listFilesRecursively(sourceDirectory)) {
    const extension = path.extname(relativePath);
    if (codeExtensions.has(extension)) {
      await inspectCodeFile(relativePath);
    } else if (extension === '.css') {
      await inspectCssFile(relativePath, false);
    }
  }
}

for (const relativePath of rootCodeFiles) {
  await inspectCodeFile(relativePath);
}
for (const relativePath of hashCommentFiles) {
  await inspectHashCommentFile(relativePath);
}
for (const relativePath of await listFilesRecursively('.github/workflows')) {
  await inspectHashCommentFile(relativePath);
}

await inspectMarkupFile('index.html');
for (const relativePath of await listFilesRecursively('public')) {
  if (path.extname(relativePath) === '.svg') {
    await inspectMarkupFile(relativePath);
  }
}

for (const relativePath of await listFilesRecursively('dist', true)) {
  const extension = path.extname(relativePath);
  if (extension === '.map') {
    violations.push(`${relativePath} source map 파일 생성 금지`);
  } else if (extension === '.js') {
    await inspectCodeFile(relativePath);
  } else if (extension === '.css') {
    await inspectCssFile(relativePath, true);
  } else if (extension === '.html' || extension === '.svg') {
    await inspectMarkupFile(relativePath);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('주석 안전 검사 통과: 민감정보·임시메모·source map이 없습니다.');
