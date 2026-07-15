import { spawnSync } from 'node:child_process';

const [deploymentRepository = 'gwcloud72/gw-mini-bot', rawApiBaseUrl] = process.argv.slice(2);

if (!rawApiBaseUrl) {
  console.error(
    '사용법: npm run configure:variables -- owner/repository https://worker.example.workers.dev',
  );
  process.exit(1);
}

let apiBaseUrl;
try {
  const configuredUrl = new URL(rawApiBaseUrl);
  if (
    configuredUrl.protocol !== 'https:' ||
    configuredUrl.username ||
    configuredUrl.password ||
    configuredUrl.search ||
    configuredUrl.hash ||
    (configuredUrl.pathname !== '/' && configuredUrl.pathname !== '')
  ) {
    throw new Error('invalid');
  }
  apiBaseUrl = configuredUrl.origin;
} catch {
  console.error('Worker 주소는 경로가 없는 HTTPS origin이어야 합니다.');
  process.exit(1);
}

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(deploymentRepository)) {
  console.error('저장소는 owner/repository 형식이어야 합니다.');
  process.exit(1);
}

const publicVariables = {
  VITE_API_BASE_URL: apiBaseUrl,
  VITE_API_ORIGIN: apiBaseUrl,
  VITE_APP_ENVIRONMENT: 'production',
  VITE_REQUEST_TIMEOUT_MS: '90000',
  VITE_HEALTH_TIMEOUT_MS: '5000',
  VITE_MAX_MESSAGE_LENGTH: '4000',
  VITE_MAX_RESPONSE_LENGTH: '32000',
  VITE_MAX_CONTEXT_MESSAGES: '24',
  VITE_MAX_PERSISTED_MESSAGES: '60',
  VITE_DEPLOYMENT_REPOSITORY: deploymentRepository,
};

const githubCliCheck = spawnSync('gh', ['--version'], { encoding: 'utf8' });
if (githubCliCheck.status !== 0) {
  console.error('GitHub CLI가 없거나 실행되지 않습니다. gh 설치 후 gh auth login을 진행하세요.');
  process.exit(1);
}

for (const [variableName, variableValue] of Object.entries(publicVariables)) {
  const setVariableResult = spawnSync(
    'gh',
    [
      'variable',
      'set',
      variableName,
      '--repo',
      deploymentRepository,
      '--body',
      variableValue,
    ],
    { encoding: 'utf8', stdio: 'pipe' },
  );

  if (setVariableResult.status !== 0) {
    console.error(`${variableName} 생성 실패`);
    console.error(setVariableResult.stderr.trim());
    process.exit(1);
  }

  console.log(`${variableName} 생성 완료`);
}

console.log(`Repository variables 10개 설정 완료: ${deploymentRepository}`);
