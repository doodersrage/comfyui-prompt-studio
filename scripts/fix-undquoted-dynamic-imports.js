#!/usr/bin/env node
/**
 * Fixes unterminated string literals in dynamic import() expressions.
 * Pattern: await import(./some-path) -> await import("./some-path")
 * Also handles: import('./module') where path starts with ./ or ../ without quotes.
 */

import fs from 'fs';
import pathModule from 'path';

function fixUndquotedImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Pattern matches: await import( followed by unquoted text until ),; or newline
  // The key is: after "import(" there should be a quoted string but instead we have raw text

  const fixedContent = content
    .replace(/await\s+import\((\s*)(\.\/[^"'`\)\n;]+)/g, (match, whitespace, filePathPart) => {
      return `await import(${whitespace}"${filePathPart}")`;
    })
    .replace(/await\s+import\((\s*)(\.\.\/[^"'`\)\n;]+)/g, (match, whitespace, filePathPart) => {
      return `await import(${whitespace}"${filePathPart}")`;
    });

  if (fixedContent !== content) {
    fs.writeFileSync(filePath, fixedContent, 'utf-8');
    console.log('Fixed:', pathModule.relative(pathModule.join(__dirname, '..'), filePath));
    return true;
  }

  return false;
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withEncoding: true });
  for (const entry of entries) {
    const fullPath = pathModule.join(dir, entry.name);
    const stat = fs.statSync(fullPath);
    if (
      stat.isDirectory() &&
      !entry.name.startsWith('node_modules') &&
      entry.name !== 'scripts' &&
      entry.name !== '.next'
    ) {
      walkDir(fullPath);
    } else if (entry.name.endsWith('.test.ts')) {
      try {
        fixUndquotedImports(fullPath);
      } catch (e) {
        console.error('Error processing', fullPath, ':', e.message);
      }
    }
  }
}

// Use path relative to project root
const srcDir = pathModule.join(__dirname, '..', 'src');
walkDir(srcDir);

console.log('Done fixing unterminated dynamic import literals.');
