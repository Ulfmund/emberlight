import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The local game server always listens on this port in development so the
// Vite dev server can proxy /api to it. (Production picks a free port itself.)
const VERSION = (JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }).version

export const DEV_SERVER_PORT = Number(process.env.EMBERLIGHT_PORT) || 41730

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@shared': resolve('src/shared') } },
    // The version the What's new window compares against (changelog.ts).
    define: { __APP_VERSION__: JSON.stringify(VERSION) },
    server: {
      proxy: { '/api': { target: `http://127.0.0.1:${DEV_SERVER_PORT}` } }
    }
  }
})
