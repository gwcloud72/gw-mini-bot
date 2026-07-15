import { describe, expect, it } from 'vitest';
import { readPublicAppConfig } from './publicAppConfig';

const validEnvironment = {
  VITE_API_BASE_URL: 'https://worker.example',
  VITE_API_ORIGIN: 'https://worker.example',
  VITE_APP_ENVIRONMENT: 'production',
  VITE_REQUEST_TIMEOUT_MS: '90000',
  VITE_HEALTH_TIMEOUT_MS: '5000',
  VITE_MAX_MESSAGE_LENGTH: '4000',
  VITE_MAX_RESPONSE_LENGTH: '32000',
  VITE_MAX_CONTEXT_MESSAGES: '24',
  VITE_MAX_PERSISTED_MESSAGES: '60',
};

describe('readPublicAppConfig', () => {
  it('accepts a matched HTTPS API origin and bounded numeric values', () => {
    expect(readPublicAppConfig(validEnvironment)).toEqual({
      apiBaseUrl: 'https://worker.example',
      apiOrigin: 'https://worker.example',
      appEnvironment: 'production',
      requestTimeoutMs: 90_000,
      healthTimeoutMs: 5_000,
      maxMessageLength: 4_000,
      maxResponseLength: 32_000,
      maxContextMessages: 24,
      maxPersistedMessages: 60,
    });
  });

  it('fails closed when the configured API origin does not match', () => {
    expect(
      readPublicAppConfig({
        ...validEnvironment,
        VITE_API_ORIGIN: 'https://other.example',
      }),
    ).toMatchObject({ apiBaseUrl: null, apiOrigin: null });
  });

  it('rejects HTTP API endpoints in production', () => {
    expect(
      readPublicAppConfig({
        ...validEnvironment,
        VITE_API_BASE_URL: 'http://worker.example',
        VITE_API_ORIGIN: 'http://worker.example',
      }),
    ).toMatchObject({ apiBaseUrl: null, apiOrigin: null });
  });

  it('falls back to bounded defaults for invalid numeric values', () => {
    expect(
      readPublicAppConfig({
        ...validEnvironment,
        VITE_REQUEST_TIMEOUT_MS: '999999',
        VITE_MAX_MESSAGE_LENGTH: '9000',
        VITE_MAX_CONTEXT_MESSAGES: '100',
      }),
    ).toMatchObject({
      requestTimeoutMs: 90_000,
      maxMessageLength: 4_000,
      maxContextMessages: 24,
    });
  });
});
