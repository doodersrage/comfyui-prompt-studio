import { execSync } from 'child_process';

// Get the original file content from git HEAD
try {
  const result = execSync(
    'git --no-pager cat-file -b HEAD:src/lib/browser-image-dimensions.test.ts',
    { cwd: process.cwd(), encoding: 'utf-8' }
  );
  console.log(result);
} catch (e) {
  console.error('Error:', e.message, e.stdout);
}
