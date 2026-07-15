import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteConfigText = await readFile(path.join(projectRoot, 'vite.config.ts'), 'utf8');
const publicVariableCheckText = await readFile(
  path.join(projectRoot, 'scripts/check-public-variables.mjs'),
  'utf8',
);
const builtSecurityCheckText = await readFile(
  path.join(projectRoot, 'scripts/check-built-security.mjs'),
  'utf8',
);
const validationErrors = [];

for (const requiredFragment of [
  'resolvePreviewBasePath()',
  'if (isPreview)',
  'base: resolvePreviewBasePath()',
  'sourcemap: false',
  'GitHub Actions 또는 Cloudflare Pages Variables에 등록하세요.',
]) {
  if (!viteConfigText.includes(requiredFragment)) {
    validationErrors.push(`Vite 필수 설정 누락: ${requiredFragment}`);
  }
}

const strictPortMatchCount = viteConfigText.match(/strictPort:\s*true/g)?.length ?? 0;
if (strictPortMatchCount !== 2) {
  validationErrors.push('Vite dev/preview strictPort 설정은 정확히 2개여야 합니다.');
}

for (const [sourceLabel, sourceText] of [
  ['공개 변수 검사', publicVariableCheckText],
  ['빌드 보안 검사', builtSecurityCheckText],
]) {
  if (!sourceText.includes("process.env.CF_PAGES === '1'")) {
    validationErrors.push(`${sourceLabel}에서 Cloudflare Pages production mode를 감지하지 못합니다.`);
  }
}

if (/sourcemap:\s*true/.test(viteConfigText)) {
  validationErrors.push('프로덕션 source map을 활성화할 수 없습니다.');
}

if (validationErrors.length > 0) {
  console.error(validationErrors.join('\n'));
  process.exit(1);
}

console.log('Vite 배포 정책 검사 통과: preview base, strictPort, Cloudflare mode, source map');
