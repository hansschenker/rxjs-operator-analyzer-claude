import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: false,
    clean: true,
    outDir: 'dist',
    target: 'node22',
  },
  {
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: false,
    outDir: 'dist',
    target: 'node22',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
