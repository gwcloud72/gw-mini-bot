import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(projectRoot, '.github/workflows/deploy.yml');
const workflowText = await readFile(workflowPath, 'utf8');
const codeOwnersText = await readFile(
  path.join(projectRoot, '.github/CODEOWNERS'),
  'utf8',
);
const workflowErrors = [];

const requiredFragments = [
  'pull_request:',
  'permissions:\n  contents: read',
  'persist-credentials: false',
  'node-version: 22.16.0',
  'npm ci --ignore-scripts',
  'npm audit --audit-level=high',
  "if: github.event_name != 'pull_request'",
  'environment:\n      name: github-pages',
  'pages: write',
  'id-token: write',
];

for (const requiredFragment of requiredFragments) {
  if (!workflowText.includes(requiredFragment)) {
    workflowErrors.push(`workflow 필수 보안 설정 누락: ${requiredFragment}`);
  }
}

const forbiddenPatterns = [
  { pattern: /pull_request_target\s*:/, label: 'pull_request_target 사용' },
  { pattern: /permissions:\s*write-all/, label: 'write-all 권한' },
  { pattern: /contents:\s*write/, label: 'contents 쓰기 권한' },
  { pattern: /actions:\s*write/, label: 'Actions 쓰기 권한' },
  { pattern: /persist-credentials:\s*true/, label: 'checkout 자격증명 유지' },
  { pattern: /continue-on-error:\s*true/, label: '보안 검사 실패 무시' },
  { pattern: /\$\{\{\s*secrets\./, label: 'Secrets 컨텍스트' },
];

for (const forbiddenPattern of forbiddenPatterns) {
  if (forbiddenPattern.pattern.test(workflowText)) {
    workflowErrors.push(`workflow 금지 설정 발견: ${forbiddenPattern.label}`);
  }
}

for (const requiredCodeOwnerPattern of [
  '* @gwcloud72',
  '/.github/ @gwcloud72',
  '/vite.config.ts @gwcloud72',
  '/scripts/ @gwcloud72',
]) {
  if (!codeOwnersText.split(/\r?\n/).includes(requiredCodeOwnerPattern)) {
    workflowErrors.push(`CODEOWNERS 필수 항목 누락: ${requiredCodeOwnerPattern}`);
  }
}

const allowedActionReferences = new Set([
  'actions/checkout@v7',
  'actions/setup-node@v6',
  'actions/configure-pages@v6',
  'actions/upload-pages-artifact@v5',
  'actions/deploy-pages@v5',
]);

for (const actionReferenceMatch of workflowText.matchAll(/uses:\s*([^\s]+)/g)) {
  const actionReference = actionReferenceMatch[1];
  if (!allowedActionReferences.has(actionReference)) {
    workflowErrors.push(`허용되지 않은 GitHub Action: ${actionReference}`);
  }
}

const buildJobStart = workflowText.indexOf('  build:');
const deployJobStart = workflowText.indexOf('  deploy:');
if (buildJobStart < 0 || deployJobStart < 0 || deployJobStart <= buildJobStart) {
  workflowErrors.push('build/deploy job 분리를 확인할 수 없습니다.');
} else {
  const buildJobText = workflowText.slice(buildJobStart, deployJobStart);
  const deployJobText = workflowText.slice(deployJobStart);

  if (/pages:\s*write|id-token:\s*write/.test(buildJobText)) {
    workflowErrors.push('build job에 Pages 배포 권한이 있습니다.');
  }

  if (!/needs:\s*build/.test(deployJobText)) {
    workflowErrors.push('deploy job이 검증된 build job에 의존하지 않습니다.');
  }
}

if (workflowErrors.length > 0) {
  console.error(workflowErrors.join('\n'));
  process.exit(1);
}

console.log('GitHub Actions 최소 권한·PR 검증 정책 통과');
