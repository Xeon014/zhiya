import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: { outDir: 'dist', target: 'es2022' }
});
