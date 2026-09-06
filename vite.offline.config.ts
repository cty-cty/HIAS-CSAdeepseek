import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  build: {
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    emptyOutDir: true,
    outDir: '.offline-build',
    target: 'es2020',
    lib: {
      entry: fileURLToPath(new URL('./offline/main.tsx', import.meta.url)),
      formats: ['iife'],
      name: 'HiasOfflineCourseApp',
      fileName: () => 'app.js',
      cssFileName: 'app',
    },
    // oxlint-disable-next-line typescript/no-deprecated -- Vite 8 兼容别名（新名 rolldownOptions）
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
