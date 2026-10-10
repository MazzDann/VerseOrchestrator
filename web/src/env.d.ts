/** App version from the root package.json (injected by Vite `define`). */
declare const __APP_VERSION__: string;
/** What the UI was built from (server/src/uiStamp.ts): the page follows a restart with new code (1.6.0). */
declare const __APP_BUILD__: string;

/** libheif (1.14.0-beta.2): the wasm build with its binary inside, loaded by lib/heic.worker.ts */
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  const factory: () => Promise<unknown>;
  export default factory;
}
