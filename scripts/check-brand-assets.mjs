import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const projectRoot = new URL('../', import.meta.url);
const expectedDisplayName = '미니챗';
const retiredDisplayNamePattern = /모아/;

function fail(message) {
  throw new Error(message);
}

async function readText(relativePath) {
  return readFile(new URL(relativePath, projectRoot), 'utf8');
}

async function assertFile(relativePath) {
  const filePath = new URL(relativePath, projectRoot);
  const fileStats = await stat(filePath);
  if (!fileStats.isFile() || fileStats.size === 0) {
    fail(`${relativePath}: 비어 있거나 일반 파일이 아닙니다.`);
  }
  return filePath;
}

async function readPngDimensions(relativePath) {
  const filePath = await assertFile(relativePath);
  const imageBuffer = await readFile(filePath);
  const pngSignature = imageBuffer.subarray(0, 8).toString('hex');
  if (pngSignature !== '89504e470d0a1a0a') {
    fail(`${relativePath}: PNG 서명이 올바르지 않습니다.`);
  }
  return {
    width: imageBuffer.readUInt32BE(16),
    height: imageBuffer.readUInt32BE(20),
  };
}

function assertIncludes(content, expectedText, label) {
  if (!content.includes(expectedText)) {
    fail(`${label}: ${JSON.stringify(expectedText)}가 없습니다.`);
  }
}

const brandSource = await readText('shared/brand.ts');
assertIncludes(
  brandSource,
  `CHATBOT_DISPLAY_NAME = '${expectedDisplayName}'`,
  '공유 브랜드 상수',
);
assertIncludes(brandSource, "CHATBOT_SERVICE_NAME = 'minichat-api'", '공유 서비스 상수');

const htmlSource = await readText('index.html');
for (const expectedHtmlFragment of [
  `<title>${expectedDisplayName} · 편하게 이어지는 대화</title>`,
  'rel="icon" href="%BASE_URL%favicon.ico"',
  'rel="icon" type="image/svg+xml" href="%BASE_URL%favicon.svg"',
  'rel="apple-touch-icon" sizes="180x180"',
  'rel="mask-icon" href="%BASE_URL%safari-pinned-tab.svg"',
  'rel="manifest" href="%BASE_URL%site.webmanifest"',
  `name="application-name" content="${expectedDisplayName}"`,
  `name="apple-mobile-web-app-title" content="${expectedDisplayName}"`,
]) {
  assertIncludes(htmlSource, expectedHtmlFragment, 'index.html');
}

const publicTextPaths = [
  'public/favicon.svg',
  'public/safari-pinned-tab.svg',
  'public/site.webmanifest',
];
for (const relativePath of publicTextPaths) {
  const content = await readText(relativePath);
  if (retiredDisplayNamePattern.test(content)) {
    fail(`${relativePath}: 이전 표시 이름이 남아 있습니다.`);
  }
}

const manifest = JSON.parse(await readText('public/site.webmanifest'));
if (manifest.short_name !== expectedDisplayName) {
  fail('site.webmanifest: short_name이 공유 표시 이름과 다릅니다.');
}
if (manifest.start_url !== './' || manifest.scope !== './') {
  fail('site.webmanifest: GitHub Pages 하위 경로 배포를 위한 상대 경로가 아닙니다.');
}
const manifestPurposes = new Set(
  (manifest.icons ?? []).flatMap((icon) => String(icon.purpose ?? '').split(/\s+/)),
);
if (!manifestPurposes.has('any') || !manifestPurposes.has('maskable')) {
  fail('site.webmanifest: any와 maskable 아이콘이 모두 필요합니다.');
}

const expectedPngDimensions = new Map([
  ['public/favicon-16x16.png', [16, 16]],
  ['public/favicon-32x32.png', [32, 32]],
  ['public/apple-touch-icon.png', [180, 180]],
  ['public/icon-192.png', [192, 192]],
  ['public/icon-512.png', [512, 512]],
  ['public/icon-maskable-512.png', [512, 512]],
]);
for (const [relativePath, [expectedWidth, expectedHeight]] of expectedPngDimensions) {
  const { width, height } = await readPngDimensions(relativePath);
  if (width !== expectedWidth || height !== expectedHeight) {
    fail(`${relativePath}: ${width}×${height}, 기대값 ${expectedWidth}×${expectedHeight}`);
  }
}

const icoPath = await assertFile('public/favicon.ico');
const icoBuffer = await readFile(icoPath);
if (icoBuffer.readUInt16LE(0) !== 0 || icoBuffer.readUInt16LE(2) !== 1) {
  fail('public/favicon.ico: ICO 헤더가 올바르지 않습니다.');
}
const icoImageCount = icoBuffer.readUInt16LE(4);
if (icoImageCount < 4) {
  fail(`public/favicon.ico: 해상도 항목이 ${icoImageCount}개뿐입니다.`);
}

for (const relativePath of ['src']) {
  const { readdir } = await import('node:fs/promises');
  async function scanDirectory(directoryUrl) {
    for (const entry of await readdir(directoryUrl, { withFileTypes: true })) {
      const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directoryUrl);
      if (entry.isDirectory()) {
        await scanDirectory(entryUrl);
      } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
        const sourceText = await readFile(entryUrl, 'utf8');
        if (retiredDisplayNamePattern.test(sourceText)) {
          fail(`${entryUrl.pathname}: 이전 표시 이름이 남아 있습니다.`);
        }
      }
    }
  }
  await scanDirectory(new URL(`${relativePath}/`, projectRoot));
}

const distHtmlPath = new URL('dist/index.html', projectRoot);
try {
  const distHtml = await readFile(distHtmlPath, 'utf8');
  assertIncludes(distHtml, `<title>${expectedDisplayName} · 편하게 이어지는 대화</title>`, 'dist/index.html');
  if (retiredDisplayNamePattern.test(distHtml)) {
    fail('dist/index.html: 이전 표시 이름이 남아 있습니다.');
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

console.log(
  `브랜드 자산 검사 통과: ${expectedDisplayName}, PNG 6개, ICO ${icoImageCount}개 해상도, PWA any/maskable`,
);
