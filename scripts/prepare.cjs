const { build } = require('esbuild');
const fs = require('node:fs');
fs.mkdirSync('public/vendor', { recursive: true });
build({
  stdin: { contents: 'export * from "@netlify/identity";', resolveDir: process.cwd() },
  bundle: true,
  platform: 'browser',
  format: 'esm',
  outfile: 'public/vendor/identity.js',
  minify: true,
}).catch(() => process.exit(1));
