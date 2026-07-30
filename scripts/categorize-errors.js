#!/usr/bin/env node
// Just lists all errors grouped by type, so I know what to fix
const { exec } = require('child_process');

exec('npx tsc --noEmit 2>&1', (error, stdout) => {
  if (stdout) {
    const lines = stdout.trim().split('\n').filter(l => l.includes('error'));
    
    // Group by error type
    const groups = {};
    for (const line of lines) {
      const match = line.match(/error TS\d+:/);
      if (match) {
        const tsCode = 'error' + match[0];
        if (!groups[tsCode]) groups[tsCode] = [];
        groups[tsCode].push(line);
      }
    }
    
    console.log('=== Error Categories ===');
    for (const [code, errors] of Object.entries(groups)) {
      const files = [...new Set(errors.map(e => e.split('(')[0]))];
      console.log(`\n${code}: ${errors.length} errors across ${files.length} files`);
      for (const f of files) console.log('  - ' + f);
    }
    
    console.log('\n=== All Errors ===');
    console.log(stdout.trim());
  }
});
