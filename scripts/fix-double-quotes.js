#!/usr/bin/env node
const fs = require('fs');
const pathModule = require('path');

const projectRoot = '/home/robertsm/Projects/comfyui-prompt-studio';

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix double-quoted imports: await import(""./something"" -> await import("./something")
  const beforeCount = (content.match(/await import\(\x22\x22/g) || []).length;
  
  if (beforeCount > 0) {
    content = content.replace(/(await import\()\x22\x22([^)]*?)\x22\x22(\s*\))/g, (match, openParen, innerPath, closeParen) => {
      return `${openParen}"${innerPath.trim()}"${closeParen}`;
    });
    
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Fixed ${beforeCount} double-quoted imports in: ${pathModule.basename(filePath)}`);
  }
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { encoding: 'utf-8' });
  for (const entry of entries) {
    const fullPath = pathModule.join(dir, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (!['node_modules', 'scripts'].includes(entry)) {
          walkDir(fullPath);
        }
      } else if (entry.endsWith('.test.ts')) {
        fixFile(fullPath);
      }
    } catch(e) {}
  }
}

const srcDir = pathModule.join(projectRoot, 'src');
walkDir(srcDir);

console.log('Done fixing double-quoted dynamic imports.');
