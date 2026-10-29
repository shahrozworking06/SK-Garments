const fs = require('node:fs');
const path = require('node:path');
async function prepare() {
  fs.mkdirSync('public', { recursive: true });
  for (const file of ['index.html', 'admin.html', 'style.css', 'admin.css', 'store.js', 'auth-redirect.js', 'tshirt-collection.png', 'tshirts-black-blue-red.png']) {
    fs.copyFileSync(file, path.join('public', file));
  }
  await require('esbuild').build({ entryPoints: ['admin.js'], outfile: 'public/admin.js', bundle: true, platform: 'browser', target: 'es2022' });
}
prepare().catch(() => { console.error('Unable to prepare site assets.'); process.exit(1); });
