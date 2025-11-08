import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const distDir = path.join(repoRoot, 'dist');

const filesToPatch: string[] = [];

const collectFiles = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectFiles(fullPath);
    } else if (stats.isFile() && fullPath.endsWith('.js')) {
      filesToPatch.push(fullPath);
    }
  }
};

try {
  const stats = statSync(distDir);
  if (!stats.isDirectory()) {
    console.log('[fix-shared-imports] dist/ not found, skipping.');
    process.exit(0);
  }
} catch {
  console.log('[fix-shared-imports] dist/ not found, skipping.');
  process.exit(0);
}

collectFiles(distDir);

const importPattern = /from\s+(['"])(\.\.\/(?:\.\.\/)*shared\/src(?:\/[-\w]+)?)\1/g;
let patchedFileCount = 0;

for (const filePath of filesToPatch) {
  let content = readFileSync(filePath, 'utf8');
  let modified = false;
  content = content.replace(importPattern, (full, quote, specifier) => {
    if (specifier.endsWith('.js')) {
      return full;
    }
    modified = true;
    const nextSpecifier = specifier.endsWith('/src') ? `${specifier}/index.js` : `${specifier}.js`;
    return `from ${quote}${nextSpecifier}${quote}`;
  });
  if (modified) {
    writeFileSync(filePath, content);
    patchedFileCount += 1;
  }
}

console.log(`[fix-shared-imports] Patched ${patchedFileCount} files.`);
