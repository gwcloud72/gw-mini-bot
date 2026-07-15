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
const generatedLicensePattern = /^!\s*tailwindcss\s+v[^|]+\|\s*MIT License\s*\|\s*https:\/\/tailwindcss\.com\s*$/;

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
    commentsByRange.set(`${position}:${end}`, {
      position,
      text: sourceText.slice(position, end),
    });
  };

  const visitNode = (node) => {
    ts.forEachLeadingCommentRange(sourceText, node.getFullStart(), recordComment);
    ts.forEachTrailingCommentRange(sourceText, node.getEnd(), recordComment);
    ts.forEachChild(node, visitNode);
  };

  ts.forEachLeadingCommentRange(sourceText, 0, recordComment);
  visitNode(sourceFile);

  return [...commentsByRange.values()].sort(
    (leftComment, rightComment) => leftComment.position - rightComment.position,
  );
}

function getLineNumber(sourceText, position) {
  return sourceText.slice(0, position).split(/\r\n|\r|\n/).length;
}

function isAllowedSourceDirective(relativePath, commentText, lineNumber) {
  const normalizedPath = relativePath.split(path.sep).join('/');
  const normalizedComment = commentText.trim();

  if (
    normalizedPath === 'src/env.d.ts' &&
    lineNumber === 1 &&
    normalizedComment === '/// <reference types="vite/client" />'
  ) {
    return true;
  }

  return (
    /\.test\.tsx?$/.test(normalizedPath) &&
    lineNumber === 1 &&
    normalizedComment === '// @vitest-environment jsdom'
  );
}

async function inspectCodeFile(relativePath, allowDirectives) {
  const sourceText = await readFile(path.join(projectRoot, relativePath), 'utf8');

  for (const sourceComment of collectCodeComments(sourceText, relativePath)) {
    const lineNumber = getLineNumber(sourceText, sourceComment.position);
    if (
      allowDirectives &&
      isAllowedSourceDirective(relativePath, sourceComment.text, lineNumber)
    ) {
      continue;
    }

    violations.push(`${relativePath}:${lineNumber} 허용되지 않은 코드 주석`);
  }
}

async function inspectCssFile(relativePath, allowGeneratedLicense) {
  const cssText = await readFile(path.join(projectRoot, relativePath), 'utf8');
  const cssRoot = postcss.parse(cssText, { from: relativePath });

  cssRoot.walkComments((commentNode) => {
    if (
      allowGeneratedLicense &&
      generatedLicensePattern.test(commentNode.text.trim())
    ) {
      return;
    }

    violations.push(
      `${relativePath}:${commentNode.source?.start?.line ?? 1} 허용되지 않은 CSS 주석`,
    );
  });
}

async function inspectMarkupFile(relativePath) {
  const markupText = await readFile(path.join(projectRoot, relativePath), 'utf8');
  const commentPattern = /<!--[\s\S]*?-->/g;
  let commentMatch = commentPattern.exec(markupText);

  while (commentMatch) {
    violations.push(
      `${relativePath}:${getLineNumber(markupText, commentMatch.index)} 허용되지 않은 마크업 주석`,
    );
    commentMatch = commentPattern.exec(markupText);
  }
}

function findHashCommentColumn(lineText) {
  let activeQuote = null;
  let isEscaped = false;

  for (let characterIndex = 0; characterIndex < lineText.length; characterIndex += 1) {
    const character = lineText[characterIndex];

    if (activeQuote === '"') {
      if (isEscaped) {
        isEscaped = false;
      } else if (character === '\\') {
        isEscaped = true;
      } else if (character === '"') {
        activeQuote = null;
      }
      continue;
    }

    if (activeQuote === "'") {
      if (character === "'") {
        activeQuote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      activeQuote = character;
      continue;
    }

    if (character === '#') {
      return characterIndex;
    }
  }

  return -1;
}

async function inspectHashCommentFile(relativePath) {
  const sourceText = await readFile(path.join(projectRoot, relativePath), 'utf8');
  const sourceLines = sourceText.split(/\r\n|\r|\n/);

  sourceLines.forEach((lineText, lineIndex) => {
    if (findHashCommentColumn(lineText) >= 0) {
      violations.push(`${relativePath}:${lineIndex + 1} 허용되지 않은 설정 주석`);
    }
  });
}

for (const sourceDirectory of sourceDirectories) {
  for (const relativePath of await listFilesRecursively(sourceDirectory)) {
    const extension = path.extname(relativePath);
    if (codeExtensions.has(extension)) {
      await inspectCodeFile(relativePath, true);
    } else if (extension === '.css') {
      await inspectCssFile(relativePath, false);
    }
  }
}

for (const relativePath of rootCodeFiles) {
  await inspectCodeFile(relativePath, false);
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

const distFiles = await listFilesRecursively('dist', true);
for (const relativePath of distFiles) {
  const extension = path.extname(relativePath);
  if (extension === '.map') {
    violations.push(`${relativePath} source map 파일 생성 금지`);
  } else if (extension === '.js') {
    await inspectCodeFile(relativePath, false);
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

console.log('주석 정책 검사 통과: 필수 도구 지시문과 Tailwind MIT 고지만 허용됩니다.');
