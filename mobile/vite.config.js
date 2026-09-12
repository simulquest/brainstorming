import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getHtmlEntries(dir = path.join(__dirname, 'src'), baseDir = path.join(__dirname, 'src')) {
  let entries = {};
  if (!fs.existsSync(dir)) return entries;

  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      Object.assign(entries, getHtmlEntries(fullPath, baseDir));
    } else if (file.name.endsWith('.html')) {
      const relativeKey = path.relative(baseDir, fullPath).split(path.sep).join('/').replace(/\.html$/, '');
      entries[relativeKey] = fullPath;
    }
  }
  return entries;
}

export default defineConfig({ root: './src', build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { input: getHtmlEntries() } } });