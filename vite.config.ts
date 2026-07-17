import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import {
  PUBLIC_ENVIRONMENT_VARIABLE_NAMES,
  type PublicEnvironmentVariableName,
} from './shared/publicEnvironmentContract';

interface ValidatedBuildEnvironment {
  apiOrigin: string;
  appEnvironment: 'development' | 'production';
  deploymentRepository: string;
}

function readRequiredValue(
  environmentValues: Record<string, string | undefined>,
  variableName: PublicEnvironmentVariableName,
): string {
  const variableValue = environmentValues[variableName]?.trim();
  if (!variableValue) {
    throw new Error(
      `${variableName} 빌드 환경변수가 필요합니다. GitHub Actions 또는 Cloudflare Pages Variables에 등록하세요.`,
    );
  }

  return variableValue;
}

function readBoundedInteger(
  environmentValues: Record<string, string | undefined>,
  variableName: PublicEnvironmentVariableName,
  minimumValue: number,
  maximumValue: number,
): number {
  const variableValue = readRequiredValue(environmentValues, variableName);
  if (!/^\d+$/.test(variableValue)) {
    throw new Error(`${variableName} 값은 정수여야 합니다.`);
  }

  const parsedValue = Number.parseInt(variableValue, 10);
  if (parsedValue < minimumValue || parsedValue > maximumValue) {
    throw new Error(
      `${variableName} 값은 ${minimumValue} 이상 ${maximumValue} 이하여야 합니다.`,
    );
  }

  return parsedValue;
}

function readRootUrl(
  environmentValues: Record<string, string | undefined>,
  variableName: 'VITE_API_BASE_URL' | 'VITE_API_ORIGIN',
  appEnvironment: 'development' | 'production',
): URL {
  const variableValue = readRequiredValue(environmentValues, variableName);
  const configuredUrl = new URL(variableValue);

  if (
    configuredUrl.username ||
    configuredUrl.password ||
    configuredUrl.search ||
    configuredUrl.hash ||
    (configuredUrl.pathname !== '/' && configuredUrl.pathname !== '')
  ) {
    throw new Error(`${variableName} 값에는 경로, 인증정보, 쿼리, 해시를 넣을 수 없습니다.`);
  }

  const isProtocolAllowed =
    configuredUrl.protocol === 'https:' ||
    (appEnvironment === 'development' &&
      configuredUrl.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(configuredUrl.hostname));

  if (!isProtocolAllowed) {
    throw new Error(`${variableName} 값은 HTTPS origin이어야 합니다.`);
  }

  return configuredUrl;
}

function validateBuildEnvironment(
  environmentValues: Record<string, string | undefined>,
): ValidatedBuildEnvironment {
  for (const variableName of PUBLIC_ENVIRONMENT_VARIABLE_NAMES) {
    readRequiredValue(environmentValues, variableName);
  }

  const appEnvironmentValue = readRequiredValue(
    environmentValues,
    'VITE_APP_ENVIRONMENT',
  );
  if (
    appEnvironmentValue !== 'development' &&
    appEnvironmentValue !== 'production'
  ) {
    throw new Error('VITE_APP_ENVIRONMENT 값은 development 또는 production이어야 합니다.');
  }

  const appEnvironment = appEnvironmentValue;
  const apiBaseUrl = readRootUrl(
    environmentValues,
    'VITE_API_BASE_URL',
    appEnvironment,
  );
  const apiOrigin = readRootUrl(
    environmentValues,
    'VITE_API_ORIGIN',
    appEnvironment,
  );

  if (apiBaseUrl.origin !== apiOrigin.origin) {
    throw new Error('VITE_API_BASE_URL과 VITE_API_ORIGIN은 같은 origin이어야 합니다.');
  }

  const requestTimeoutMs = readBoundedInteger(
    environmentValues,
    'VITE_REQUEST_TIMEOUT_MS',
    15_000,
    120_000,
  );
  const healthTimeoutMs = readBoundedInteger(
    environmentValues,
    'VITE_HEALTH_TIMEOUT_MS',
    1_000,
    15_000,
  );
  readBoundedInteger(
    environmentValues,
    'VITE_MAX_MESSAGE_LENGTH',
    500,
    4_000,
  );
  readBoundedInteger(
    environmentValues,
    'VITE_MAX_RESPONSE_LENGTH',
    4_000,
    64_000,
  );
  const maxContextMessages = readBoundedInteger(
    environmentValues,
    'VITE_MAX_CONTEXT_MESSAGES',
    2,
    24,
  );
  const maxPersistedMessages = readBoundedInteger(
    environmentValues,
    'VITE_MAX_PERSISTED_MESSAGES',
    maxContextMessages,
    100,
  );

  if (healthTimeoutMs >= requestTimeoutMs) {
    throw new Error('VITE_HEALTH_TIMEOUT_MS는 VITE_REQUEST_TIMEOUT_MS보다 작아야 합니다.');
  }

  if (maxPersistedMessages < maxContextMessages) {
    throw new Error('VITE_MAX_PERSISTED_MESSAGES는 VITE_MAX_CONTEXT_MESSAGES 이상이어야 합니다.');
  }

  const deploymentRepository = readRequiredValue(
    environmentValues,
    'VITE_DEPLOYMENT_REPOSITORY',
  );
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(deploymentRepository)) {
    throw new Error('VITE_DEPLOYMENT_REPOSITORY 값은 owner/repository 형식이어야 합니다.');
  }

  if (process.env.GITHUB_ACTIONS === 'true') {
    if (appEnvironment !== 'production') {
      throw new Error('GitHub Pages 배포에서는 VITE_APP_ENVIRONMENT=production이어야 합니다.');
    }

    if (process.env.GITHUB_REPOSITORY !== deploymentRepository) {
      throw new Error(
        `배포 저장소 불일치: ${deploymentRepository} 대신 ${process.env.GITHUB_REPOSITORY ?? 'unknown'}에서 실행 중입니다.`,
      );
    }
  }

  return {
    apiOrigin: apiOrigin.origin,
    appEnvironment,
    deploymentRepository,
  };
}

function resolveBasePath(deploymentRepository: string): string {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    return '/';
  }

  const [repositoryOwner, repositoryName] = deploymentRepository.split('/');
  if (!repositoryOwner || !repositoryName || repositoryName === `${repositoryOwner}.github.io`) {
    return '/';
  }

  return `/${repositoryName}/`;
}

function resolvePreviewBasePath(): string {
  const builtIndexFilePath = fileURLToPath(
    new URL('./dist/index.html', import.meta.url),
  );

  if (!existsSync(builtIndexFilePath)) {
    throw new Error('dist/index.html이 없습니다. 먼저 npm run build를 실행하세요.');
  }

  const builtIndexHtml = readFileSync(builtIndexFilePath, 'utf8');
  const localAssetPathMatch = builtIndexHtml.match(
    /(?:src|href)="(\/(?:[^"]*\/)?assets\/[^"]+)"/,
  );
  const localAssetPath = localAssetPathMatch?.[1];

  if (!localAssetPath) {
    throw new Error('dist/index.html에서 Vite asset 경로를 찾지 못했습니다.');
  }

  const assetSegmentIndex = localAssetPath.lastIndexOf('/assets/');
  if (assetSegmentIndex < 0) {
    throw new Error('dist/index.html의 Vite asset 경로가 올바르지 않습니다.');
  }

  const basePathPrefix = localAssetPath.slice(0, assetSegmentIndex);
  return basePathPrefix ? `${basePathPrefix}/` : '/';
}

function createSecurityMetaPlugin(
  apiOrigin: string,
  appEnvironment: 'development' | 'production',
): Plugin {
  const contentSecurityPolicyDirectives = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "script-src 'self'",
    appEnvironment === 'production'
      ? "style-src 'self' https://unpkg.com"
      : "style-src 'self' 'unsafe-inline' https://unpkg.com",
    "font-src 'self' data: https://unpkg.com https://cdn.jsdelivr.net",
    "img-src 'self' data: blob:",
    appEnvironment === 'production'
      ? `connect-src 'self' ${apiOrigin}`
      : `connect-src 'self' ${apiOrigin} ws://localhost:* http://localhost:*`,
    "manifest-src 'self'",
    "media-src 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "form-action 'self'",
    appEnvironment === 'production' ? 'upgrade-insecure-requests' : '',
  ].filter(Boolean);

  return {
    name: 'minichat-security-meta',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: contentSecurityPolicyDirectives.join('; '),
          },
          injectTo: 'head-prepend',
        },
        {
          tag: 'meta',
          attrs: {
            name: 'referrer',
            content: 'no-referrer',
          },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

export default defineConfig(({ mode, isPreview }) => {
  if (isPreview) {
    return {
      base: resolvePreviewBasePath(),
      preview: {
        host: true,
        port: 4173,
        strictPort: true,
      },
    };
  }

  const environmentValues = {
    ...loadEnv(mode, process.cwd(), ''),
    ...process.env,
  };
  const validatedBuildEnvironment = validateBuildEnvironment(environmentValues);

  return {
    base: resolveBasePath(validatedBuildEnvironment.deploymentRepository),
    plugins: [
      createSecurityMetaPlugin(
        validatedBuildEnvironment.apiOrigin,
        validatedBuildEnvironment.appEnvironment,
      ),
      react(),
      tailwindcss(),
    ],
    build: {
      sourcemap: false,
      reportCompressedSize: true,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
    },
  };
});
