const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Find all *.test.ts files under src/
const result = execSync("find src -name '*.test.ts'", {
  cwd: process.cwd(),
  encoding: "utf-8",
});

const files = result.trim().split("\n").filter(Boolean);
let fixedCount = 0;
let skippedCount = 0;

for (const file of files) {
  const fullPath = path.join(process.cwd(), file);
  try {
    let content = fs.readFileSync(fullPath, "utf-8");
    
    // Fix multi-line imports where .ts extension is on a separate line:
    // Pattern: await import( \n   "./module.ts" \n )
    // Should become: await import( \n   "./module" \n )
    const corruptedPattern = /await import\(\s*["']([^"']*?)\.ts["']/g;
    const matches = content.match(corruptedPattern);
    
    if (matches && matches.length > 0) {
      // Fix: remove .ts but keep the quotes around $1
      content = content.replace(/await import\(\s*["']([^"']*?)\.ts["']/g, 'await import("$1"');
      
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
