import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowText = await readFile(
  path.join(projectRoot, '.github/workflows/deploy.yml'),
  'utf8',
);
const codeOwnersText = await readFile(
  path.join(projectRoot, '.github/CODEOWNERS'),
  'utf8',
);
const workflowErrors = [];

const requiredPatterns = [
  { pattern: /^\s{2}pull_request:\s*$/m, label: 'pull_request 검증' },
  { pattern: /^permissions:\s*\n\s{2}contents:\s*read\s*$/m, label: '기본 읽기 권한' },
  { pattern: /persist-credentials:\s*false/, label: 'checkout 자격증명 비보존' },
  { pattern: /node-version:\s*22\.16\.0/, label: 'Node 버전 고정' },
  { pattern: /npm ci --ignore-scripts/, label: '설치 스크립트 차단' },
  { pattern: /npm audit --audit-level=high/, label: '의존성 감사' },
  { pattern: /if:\s*github\.event_name != 'pull_request'/, label: 'PR 배포 차단' },
  { pattern: /environment:\s*\n\s+name:\s*github-pages/, label: 'Pages 환경' },
  { pattern: /^\s+pages:\s*write\s*$/m, label: 'Pages 배포 권한' },
  { pattern: /^\s+id-token:\s*write\s*$/m, label: 'OIDC 권한' },
];

for (const requiredPattern of requiredPatterns) {
  if (!requiredPattern.pattern.test(workflowText)) {
    workflowErrors.push(`workflow 필수 보안 설정 누락: ${requiredPattern.label}`);
  }
}

const forbiddenPatterns = [
  { pattern: /pull_request_target\s*:/, label: 'pull_request_target 사용' },
  { pattern: /permissions:\s*write-all/, label: 'write-all 권한' },
  { pattern: /^\s+contents:\s*write\s*$/m, label: 'contents 쓰기 권한' },
  { pattern: /^\s+actions:\s*write\s*$/m, label: 'Actions 쓰기 권한' },
  { pattern: /persist-credentials:\s*true/, label: 'checkout 자격증명 유지' },
  { pattern: /continue-on-error:\s*true/, label: '검사 실패 무시' },
  { pattern: /\$\{\{\s*secrets\./, label: 'Secrets 컨텍스트' },
  { pattern: /uses:\s*[^\s]+@(main|master|latest)\b/i, label: '부동 Action 참조' },
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

const allowedActionNames = new Set([
  'actions/checkout',
  'actions/setup-node',
  'actions/configure-pages',
  'actions/upload-pages-artifact',
  'actions/deploy-pages',
]);
const safeActionReferencePattern = /^(?:v[1-9]\d*|[a-f0-9]{40})$/;

for (const actionUsageMatch of workflowText.matchAll(/uses:\s*([^\s]+)/g)) {
  const actionUsage = actionUsageMatch[1] ?? '';
  const separatorIndex = actionUsage.lastIndexOf('@');
  if (separatorIndex <= 0 || separatorIndex === actionUsage.length - 1) {
    workflowErrors.push(`버전이 고정되지 않은 GitHub Action 참조: ${actionUsage}`);
    continue;
  }

  const actionName = actionUsage.slice(0, separatorIndex);
  const actionReference = actionUsage.slice(separatorIndex + 1);
  if (!allowedActionNames.has(actionName)) {
    workflowErrors.push(`허용되지 않은 GitHub Action: ${actionName}`);
    continue;
  }
  if (!safeActionReferencePattern.test(actionReference)) {
    workflowErrors.push(`안전하지 않은 GitHub Action 참조: ${actionUsage}`);
  }
}

const buildJobStart = workflowText.indexOf('  build:');
const deployJobStart = workflowText.indexOf('  deploy:');
if (buildJobStart < 0 || deployJobStart < 0 || deployJobStart <= buildJobStart) {
  workflowErrors.push('build/deploy job 분리를 확인할 수 없습니다.');
} else {
  const buildJobText = workflowText.slice(buildJobStart, deployJobStart);
  const deployJobText = workflowText.slice(deployJobStart);

  if (/^\s+pages:\s*write\s*$/m.test(buildJobText)) {
    workflowErrors.push('build job에 Pages 배포 권한이 있습니다.');
  }
  if (/^\s+id-token:\s*write\s*$/m.test(buildJobText)) {
    workflowErrors.push('build job에 OIDC 쓰기 권한이 있습니다.');
  }
  if (!/needs:\s*build/.test(deployJobText)) {
    workflowErrors.push('deploy job이 검증된 build job에 의존하지 않습니다.');
  }
}

if (workflowErrors.length > 0) {
  console.error(workflowErrors.join('\n'));
  process.exit(1);
}

console.log('GitHub Actions 최소 권한·고정 참조·PR 검증 정책 통과');
