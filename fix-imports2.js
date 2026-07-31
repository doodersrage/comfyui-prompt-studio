import fs from 'fs';
import pathModule from 'path';
import { execSync } from 'child_process';

// Find all *.test.ts files under src/
const result = execSync("find src -name '*.test.ts'", {
  cwd: process.cwd(),
  encoding: 'utf-8',
});

const files = result.trim().split('\n').filter(Boolean);
let fixedCount = 0;
let skippedCount = 0;

for (const file of files) {
  const fullPath = pathModule.join(process.cwd(), file);
  try {
    let content = fs.readFileSync(fullPath, 'utf-8');

    // Check if this file has import path double-quote corruption
    // Pattern: "./something"" or './something'' (extra quote before semicolon/closing)
    const corruptedPattern = /from "\.\/([^"]*?)""/g;
    const matches = content.match(corruptedPattern);

    if (matches && matches.length > 0) {
      // Fix: replace from "./module"" with from "./module"
      content = content.replace(/from "\.\/([^"]*?)""/g, 'from "./$1"');

      fs.writeFileSync(fullPath, content);
      fixedCount++;
    } else {
      skippedCount++;
    }
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
  }
}

console.log(`Fixed: ${fixedCount}, Skipped: ${skippedCount}`);
