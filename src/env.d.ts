/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_APP_ENVIRONMENT?: string;
  readonly VITE_REQUEST_TIMEOUT_MS?: string;
  readonly VITE_HEALTH_TIMEOUT_MS?: string;
  readonly VITE_MAX_MESSAGE_LENGTH?: string;
  readonly VITE_MAX_RESPONSE_LENGTH?: string;
  readonly VITE_MAX_CONTEXT_MESSAGES?: string;
  readonly VITE_MAX_PERSISTED_MESSAGES?: string;
  readonly VITE_DEPLOYMENT_REPOSITORY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
