/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOKEN_BUDGET: string;
  readonly VITE_OPENAI_MODEL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
