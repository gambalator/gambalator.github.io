import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const isSingleFileBuild = mode === 'single'

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
    test: {
      environment: 'jsdom',
      setupFiles: './tests/setup.ts',
      css: true,
    },
  }
})
