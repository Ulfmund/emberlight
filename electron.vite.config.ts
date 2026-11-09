import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The local game server always listens on this port in development so the
// Vite dev server can proxy /api to it. (Production picks a free port itself.)
export const DEV_SERVER_PORT = Number(process.env.EMBERLIGHT_PORT) || 41730

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@shared': resolve('src/shared') } },
    server: {
      proxy: { '/api': { target: `http://127.0.0.1:${DEV_SERVER_PORT}` } }
    }
  }
})
