import { execSync } from 'child_process';

// Use git's cat-file to dump blob content
try {
  const result = execSync(
    'git --no-pager cat-file b HEAD:src/lib/browser-image-dimensions.test.ts',
    { cwd: process.cwd(), encoding: 'utf-8', stdio: 'pipe' }
  );
  console.log(result);
} catch (e) {
  console.error('Stderr:', e.stderr);
  console.error('Error:', e.message);
}
