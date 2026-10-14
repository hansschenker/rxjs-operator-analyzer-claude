import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  base: './',
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
  },
  server: {
    port: 5180,
    fs: { allow: ['..'] },
  },
});
