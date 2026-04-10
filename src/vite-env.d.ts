/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_COPILOT_REQUEST_TIMEOUT_MS?: string;
  readonly VITE_COPILOT_DISSEMINATION_TIMEOUT_MS?: string;
  readonly VITE_OWM_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.geojson' {
  const value: import('geojson').FeatureCollection;
  export default value;
}
