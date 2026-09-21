import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const isSingleFileBuild = mode === 'single'
  const backendUrl = process.env.GAMBALATOR_BACKEND_URL ?? 'http://127.0.0.1:5741'
  const configuredDevPort = Number(process.env.GAMBALATOR_DEV_PORT)
  const developmentServer = Number.isInteger(configuredDevPort)
    && configuredDevPort > 0
    && configuredDevPort <= 65_535
    ? {
        host: '127.0.0.1',
        port: configuredDevPort,
        strictPort: true,
      }
    : {}

  return {
    base: isSingleFileBuild ? './' : '/',
    plugins: [react()],
    build: isSingleFileBuild
      ? {
          outDir: 'dist-single',
          assetsInlineLimit: Number.MAX_SAFE_INTEGER,
          cssCodeSplit: false,
        }
      : undefined,
    server: {
      ...developmentServer,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './tests/setup.ts',
      css: true,
    },
  }
})
