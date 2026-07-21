import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from "vite-plugin-svgr";

export default defineConfig({
  plugins: [
      react(),
      svgr()
  ],
  build: {
      target: 'es2022'
  },
  esbuild: {
      target: 'es2022'
  },
  optimizeDeps: {
      esbuildOptions: {
          target: 'es2022'
      }
  },
  test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      css: true,
  },
})
