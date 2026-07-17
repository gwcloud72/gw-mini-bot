import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environmentContractText = await readFile(
  path.join(projectRoot, 'shared/publicEnvironmentContract.ts'),
  'utf8',
);
const environmentContractBlock = environmentContractText.match(
  /PUBLIC_ENVIRONMENT_VARIABLE_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/,
)?.[1];

if (!environmentContractBlock) {
  throw new Error('공개 환경변수 계약 목록을 읽지 못했습니다.');
}

const publicVariableNames = [
  ...environmentContractBlock.matchAll(/['"](VITE_[A-Z0-9_]+)['"]/g),
].map((matchResult) => matchResult[1]);

if (
  publicVariableNames.length !== 10 ||
  new Set(publicVariableNames).size !== publicVariableNames.length
) {
  throw new Error('공개 환경변수 계약은 중복 없는 정확히 10개여야 합니다.');
}

const runtimePublicVariableNames = publicVariableNames.filter(
  (variableName) => variableName !== 'VITE_DEPLOYMENT_REPOSITORY',
);
const validationErrors = [];
const mode =
  process.env.GITHUB_ACTIONS === 'true' ||
  process.env.CF_PAGES === '1' ||
  process.env.VITE_APP_ENVIRONMENT === 'production'
    ? 'production'
    : 'development';
const environmentValues = {
  ...loadEnv(mode, projectRoot, ''),
  ...process.env,
};

function readRequiredValue(variableName) {
  const variableValue = environmentValues[variableName]?.trim();
  if (!variableValue) {
    validationErrors.push(`${variableName} 값이 없습니다.`);
    return '';
  }

  return variableValue;
}

function readRootUrl(variableName, appEnvironment) {
  const variableValue = readRequiredValue(variableName);
  if (!variableValue) {
    return null;
  }

  try {
    const configuredUrl = new URL(variableValue);
    if (
      configuredUrl.username ||
      configuredUrl.password ||
      configuredUrl.search ||
      configuredUrl.hash ||
      (configuredUrl.pathname !== '/' && configuredUrl.pathname !== '')
    ) {
      validationErrors.push(`${variableName}에는 origin만 입력해야 합니다.`);
      return null;
    }

    const isAllowedProtocol =
      configuredUrl.protocol === 'https:' ||
      (appEnvironment === 'development' &&
        configuredUrl.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(configuredUrl.hostname));

    if (!isAllowedProtocol) {
      validationErrors.push(`${variableName}은 HTTPS origin이어야 합니다.`);
      return null;
    }

    if (
      appEnvironment === 'production' &&
      (configuredUrl.hostname.includes('.example.') ||
        configuredUrl.hostname.endsWith('.example'))
    ) {
      validationErrors.push(`${variableName}에 예시 주소가 남아 있습니다.`);
      return null;
    }

    return configuredUrl;
  } catch {
    validationErrors.push(`${variableName}이 올바른 URL이 아닙니다.`);
    return null;
  }
}

function readBoundedInteger(variableName, minimumValue, maximumValue) {
  const variableValue = readRequiredValue(variableName);
  if (!/^\d+$/.test(variableValue)) {
    validationErrors.push(`${variableName} 값은 정수여야 합니다.`);
    return null;
  }

  const parsedValue = Number.parseInt(variableValue, 10);
  if (parsedValue < minimumValue || parsedValue > maximumValue) {
    validationErrors.push(
      `${variableName} 값은 ${minimumValue} 이상 ${maximumValue} 이하여야 합니다.`,
    );
    return null;
  }

  return parsedValue;
}

function compareExactVariableSet(
  sourceLabel,
  discoveredNames,
  expectedVariableNames = publicVariableNames,
) {
  const expectedNames = [...expectedVariableNames].sort();
  const normalizedNames = [...new Set(discoveredNames)].sort();

  if (JSON.stringify(expectedNames) !== JSON.stringify(normalizedNames)) {
    validationErrors.push(
      `${sourceLabel} 변수 목록이 계약과 일치하지 않습니다. ` +
        `예상: ${expectedNames.join(', ')} / 현재: ${normalizedNames.join(', ')}`,
    );
  }
}

function findPublicVariableNames(sourceText) {
  return [...sourceText.matchAll(/\bVITE_[A-Z0-9_]+\b/g)].map(
    (matchResult) => matchResult[0],
  );
}

function findRuntimeEnvironmentPropertyNames(sourceText) {
  return [
    ...sourceText.matchAll(/environmentValues\.(VITE_[A-Z0-9_]+)/g),
  ].map((matchResult) => matchResult[1]);
}

const appEnvironment = readRequiredValue('VITE_APP_ENVIRONMENT');
if (appEnvironment !== 'development' && appEnvironment !== 'production') {
  validationErrors.push('VITE_APP_ENVIRONMENT 값은 development 또는 production이어야 합니다.');
}

const apiBaseUrl = readRootUrl('VITE_API_BASE_URL', appEnvironment);
const apiOrigin = readRootUrl('VITE_API_ORIGIN', appEnvironment);
if (apiBaseUrl && apiOrigin && apiBaseUrl.origin !== apiOrigin.origin) {
  validationErrors.push('VITE_API_BASE_URL과 VITE_API_ORIGIN이 일치하지 않습니다.');
}

const requestTimeoutMs = readBoundedInteger(
  'VITE_REQUEST_TIMEOUT_MS',
  15_000,
  120_000,
);
const healthTimeoutMs = readBoundedInteger(
  'VITE_HEALTH_TIMEOUT_MS',
  1_000,
  15_000,
);
readBoundedInteger('VITE_MAX_MESSAGE_LENGTH', 500, 4_000);
readBoundedInteger('VITE_MAX_RESPONSE_LENGTH', 4_000, 64_000);
const maxContextMessages = readBoundedInteger(
  'VITE_MAX_CONTEXT_MESSAGES',
  2,
  24,
);
const maxPersistedMessages = readBoundedInteger(
  'VITE_MAX_PERSISTED_MESSAGES',
  maxContextMessages ?? 2,
  100,
);

if (
  requestTimeoutMs !== null &&
  healthTimeoutMs !== null &&
  healthTimeoutMs >= requestTimeoutMs
) {
  validationErrors.push('VITE_HEALTH_TIMEOUT_MS는 요청 제한 시간보다 작아야 합니다.');
}

if (
  maxContextMessages !== null &&
  maxPersistedMessages !== null &&
  maxPersistedMessages < maxContextMessages
) {
  validationErrors.push('저장 메시지 수는 문맥 메시지 수 이상이어야 합니다.');
}

const deploymentRepository = readRequiredValue('VITE_DEPLOYMENT_REPOSITORY');
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(deploymentRepository)) {
  validationErrors.push('VITE_DEPLOYMENT_REPOSITORY는 owner/repository 형식이어야 합니다.');
}

if (process.env.GITHUB_ACTIONS === 'true') {
  if (appEnvironment !== 'production') {
    validationErrors.push('GitHub Pages에서는 production 환경만 허용됩니다.');
  }

  if (process.env.GITHUB_REPOSITORY !== deploymentRepository) {
    validationErrors.push('현재 GitHub 저장소와 VITE_DEPLOYMENT_REPOSITORY가 다릅니다.');
  }
}

const [workflowText, environmentTypeText, viteConfigurationText, runtimeConfigurationText] =
  await Promise.all([
    readFile(path.join(projectRoot, '.github/workflows/deploy.yml'), 'utf8'),
    readFile(path.join(projectRoot, 'src/env.d.ts'), 'utf8'),
    readFile(path.join(projectRoot, 'vite.config.ts'), 'utf8'),
    readFile(path.join(projectRoot, 'src/config/publicAppConfig.ts'), 'utf8'),
  ]);
const workflowVariableNames = [...workflowText.matchAll(/vars\.([A-Z0-9_]+)/g)].map(
  (matchResult) => matchResult[1],
);
compareExactVariableSet('GitHub Actions workflow', workflowVariableNames);
compareExactVariableSet(
  'src/env.d.ts',
  findPublicVariableNames(environmentTypeText),
);
compareExactVariableSet(
  'vite.config.ts',
  findPublicVariableNames(viteConfigurationText),
);
compareExactVariableSet(
  'src/config/publicAppConfig.ts',
  findRuntimeEnvironmentPropertyNames(runtimeConfigurationText),
  runtimePublicVariableNames,
);

if (/secrets\./.test(workflowText)) {
  validationErrors.push('프런트 배포 workflow에서 secrets 컨텍스트를 사용할 수 없습니다.');
}

if (validationErrors.length > 0) {
  console.error(validationErrors.join('\n'));
  process.exit(1);
}

console.log('공개 GitHub Actions Variable 10개 검증 통과');
