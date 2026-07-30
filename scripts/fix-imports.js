#!/usr/bin/env node
const fs = require('fs');
const pathModule = require('path');

const projectRoot = '/home/robertsm/Projects/comfyui-prompt-studio';

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix: await import(./something without quotes -> await import("./something")
  // The pattern is: import(\s* followed by ./. or ../ without opening quote
  const beforeCount = (content.match(/await import\([^"'`]/g) || []).length;
  
  if (beforeCount > 0) {
    content = content.replace(/(await import\()\s*(?!"|'|`)([^)'`\n;,]+)(\s*\))/g, (match, openParen, innerPath, closeParen) => {
      return `${openParen}"${innerPath.trim()}"${closeParen}`;
    });
    
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Fixed ${beforeCount} unterminated imports in: ${pathModule.basename(filePath)}`);
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

console.log('Done fixing unterminated dynamic imports.');
