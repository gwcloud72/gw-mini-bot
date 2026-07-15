import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = path.join(projectRoot, 'dist');
const validationErrors = [];

async function assertFileExists(relativePath) {
  try {
    await access(path.join(projectRoot, relativePath));
  } catch {
    validationErrors.push(`${relativePath} 파일이 없습니다.`);
  }
}

function resolveExpectedBasePath(deploymentRepository) {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    return '/';
  }

  const [repositoryOwner, repositoryName] = deploymentRepository.split('/');
  if (!repositoryOwner || !repositoryName || repositoryName === `${repositoryOwner}.github.io`) {
    return '/';
  }

  return `/${repositoryName}/`;
}

function extractLocalAssetPath(indexHtml, extension) {
  const pathPattern = new RegExp(
    `(?:src|href)="(\\/(?:[^"]*\\/)?assets\\/[^"]+\\.${extension})"`,
  );
  return indexHtml.match(pathPattern)?.[1] ?? null;
}

async function listFilesRecursively(absoluteDirectory) {
  const directoryEntries = await readdir(absoluteDirectory, { withFileTypes: true });
  const discoveredFiles = [];

  for (const directoryEntry of directoryEntries) {
    const absoluteEntryPath = path.join(absoluteDirectory, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      discoveredFiles.push(...(await listFilesRecursively(absoluteEntryPath)));
    } else if (directoryEntry.isFile()) {
      discoveredFiles.push(absoluteEntryPath);
    }
  }

  return discoveredFiles;
}

const packageLock = JSON.parse(
  await readFile(path.join(projectRoot, 'package-lock.json'), 'utf8'),
);
const deploymentRepository = process.env.VITE_DEPLOYMENT_REPOSITORY?.trim() ?? '';
const expectedBasePath = resolveExpectedBasePath(deploymentRepository);
const indexHtml = await readFile(path.join(distDirectory, 'index.html'), 'utf8');
const javascriptAssetPath = extractLocalAssetPath(indexHtml, 'js');
const cssAssetPath = extractLocalAssetPath(indexHtml, 'css');
const resolvedViteVersion = packageLock.packages?.['node_modules/vite']?.version;

if (!resolvedViteVersion) {
  validationErrors.push('package-lock.json에서 Vite 버전을 확인하지 못했습니다.');
}

if (indexHtml.includes('%BASE_URL%') || indexHtml.includes('/src/main.tsx')) {
  validationErrors.push('dist/index.html에 변환되지 않은 Vite 개발 경로가 남아 있습니다.');
}

for (const [assetLabel, assetPath] of [
  ['JavaScript', javascriptAssetPath],
  ['CSS', cssAssetPath],
]) {
  if (!assetPath) {
    validationErrors.push(`${assetLabel} asset 경로를 찾지 못했습니다.`);
    continue;
  }

  if (!assetPath.startsWith(`${expectedBasePath}assets/`)) {
    validationErrors.push(
      `${assetLabel} asset 경로가 예상 base ${expectedBasePath}와 일치하지 않습니다.`,
    );
    continue;
  }

  await assertFileExists(path.join('dist', assetPath.slice(expectedBasePath.length)));
}

for (const publicAssetName of ['favicon.svg', 'site.webmanifest']) {
  if (!indexHtml.includes(`${expectedBasePath}${publicAssetName}`)) {
    validationErrors.push(`${publicAssetName} 경로가 예상 base와 일치하지 않습니다.`);
  }
}

const generatedFiles = await listFilesRecursively(distDirectory);
if (generatedFiles.some((filePath) => filePath.endsWith('.map'))) {
  validationErrors.push('Vite 빌드에 source map 파일이 생성됐습니다.');
}

if (validationErrors.length > 0) {
  console.error(validationErrors.join('\n'));
  process.exit(1);
}

console.log(`Vite 출력 검사 통과: v${resolvedViteVersion}, base ${expectedBasePath}`);
