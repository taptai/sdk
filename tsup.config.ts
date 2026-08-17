import { defineConfig } from 'tsup'

// Two entries: the library (index) and the bin (cli). ESM + types, clean dist.
// The cli's shebang survives the bundle (esbuild keeps a leading #!).
export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts' } },
  clean: true,
  target: 'node18',
})
