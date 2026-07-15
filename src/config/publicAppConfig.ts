export type AppEnvironment = 'development' | 'production';

export interface PublicAppConfig {
  apiBaseUrl: string | null;
  apiOrigin: string | null;
  appEnvironment: AppEnvironment;
  requestTimeoutMs: number;
  healthTimeoutMs: number;
  maxMessageLength: number;
  maxResponseLength: number;
  maxContextMessages: number;
  maxPersistedMessages: number;
}

const DEFAULT_PUBLIC_APP_CONFIG: PublicAppConfig = {
  apiBaseUrl: null,
  apiOrigin: null,
  appEnvironment: 'development',
  requestTimeoutMs: 90_000,
  healthTimeoutMs: 5_000,
  maxMessageLength: 4_000,
  maxResponseLength: 32_000,
  maxContextMessages: 24,
  maxPersistedMessages: 60,
};

function readBoundedInteger(
  rawValue: string | undefined,
  fallbackValue: number,
  minimumValue: number,
  maximumValue: number,
): number {
  if (!rawValue || !/^\d+$/.test(rawValue.trim())) {
    return fallbackValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < minimumValue ||
    parsedValue > maximumValue
  ) {
    return fallbackValue;
  }

  return parsedValue;
}

function normalizeConfiguredUrl(rawValue: string | undefined): string | null {
  const trimmedValue = rawValue?.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    const configuredUrl = new URL(trimmedValue);
    if (
      configuredUrl.username ||
      configuredUrl.password ||
      configuredUrl.search ||
      configuredUrl.hash ||
      (configuredUrl.pathname !== '/' && configuredUrl.pathname !== '')
    ) {
      return null;
    }

    return configuredUrl.origin;
  } catch {
    return null;
  }
}

function readAppEnvironment(rawValue: string | undefined): AppEnvironment {
  return rawValue?.trim() === 'production' ? 'production' : 'development';
}

export function readPublicAppConfig(
  environmentValues: Pick<
    ImportMetaEnv,
    | 'VITE_API_BASE_URL'
    | 'VITE_API_ORIGIN'
    | 'VITE_APP_ENVIRONMENT'
    | 'VITE_REQUEST_TIMEOUT_MS'
    | 'VITE_HEALTH_TIMEOUT_MS'
    | 'VITE_MAX_MESSAGE_LENGTH'
    | 'VITE_MAX_RESPONSE_LENGTH'
    | 'VITE_MAX_CONTEXT_MESSAGES'
    | 'VITE_MAX_PERSISTED_MESSAGES'
  >,
): PublicAppConfig {
  const appEnvironment = readAppEnvironment(
    environmentValues.VITE_APP_ENVIRONMENT,
  );
  const apiBaseUrl = normalizeConfiguredUrl(
    environmentValues.VITE_API_BASE_URL,
  );
  const apiOrigin = normalizeConfiguredUrl(environmentValues.VITE_API_ORIGIN);
  const isApiProtocolAllowed = (configuredUrl: string | null) => {
    if (!configuredUrl) {
      return false;
    }

    const protocol = new URL(configuredUrl).protocol;
    return appEnvironment === 'production'
      ? protocol === 'https:'
      : protocol === 'https:' || protocol === 'http:';
  };
  const isApiConfigurationValid =
    apiBaseUrl !== null &&
    apiOrigin !== null &&
    apiBaseUrl === apiOrigin &&
    isApiProtocolAllowed(apiBaseUrl);

  const maxContextMessages = readBoundedInteger(
    environmentValues.VITE_MAX_CONTEXT_MESSAGES,
    DEFAULT_PUBLIC_APP_CONFIG.maxContextMessages,
    2,
    24,
  );
  const maxPersistedMessages = readBoundedInteger(
    environmentValues.VITE_MAX_PERSISTED_MESSAGES,
    DEFAULT_PUBLIC_APP_CONFIG.maxPersistedMessages,
    maxContextMessages,
    100,
  );

  return {
    apiBaseUrl: isApiConfigurationValid ? apiBaseUrl : null,
    apiOrigin: isApiConfigurationValid ? apiOrigin : null,
    appEnvironment,
    requestTimeoutMs: readBoundedInteger(
      environmentValues.VITE_REQUEST_TIMEOUT_MS,
      DEFAULT_PUBLIC_APP_CONFIG.requestTimeoutMs,
      15_000,
      120_000,
    ),
    healthTimeoutMs: readBoundedInteger(
      environmentValues.VITE_HEALTH_TIMEOUT_MS,
      DEFAULT_PUBLIC_APP_CONFIG.healthTimeoutMs,
      1_000,
      15_000,
    ),
    maxMessageLength: readBoundedInteger(
      environmentValues.VITE_MAX_MESSAGE_LENGTH,
      DEFAULT_PUBLIC_APP_CONFIG.maxMessageLength,
      500,
      4_000,
    ),
    maxResponseLength: readBoundedInteger(
      environmentValues.VITE_MAX_RESPONSE_LENGTH,
      DEFAULT_PUBLIC_APP_CONFIG.maxResponseLength,
      4_000,
      64_000,
    ),
    maxContextMessages,
    maxPersistedMessages,
  };
}

export function getPublicAppConfig(): PublicAppConfig {
  return readPublicAppConfig(import.meta.env);
}
