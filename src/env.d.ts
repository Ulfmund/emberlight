/// <reference types="vite/client" />

declare module '*?asset' {
  const path: string
  export default path
}

/** The app's version, from package.json (electron.vite.config.ts). */
declare const __APP_VERSION__: string
