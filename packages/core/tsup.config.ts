// tsup.config.ts is intentionally minimal — template copying is handled
// by the postbuild npm script to avoid filesystem permission issues in
// sandboxed environments.
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
