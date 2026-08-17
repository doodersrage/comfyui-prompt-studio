export const GITHUB_REPO_URL = 'https://github.com/doodersrage/llm-prompt-studio';

export function githubBugReportUrl(input?: { pathname?: string }): string {
  const url = new URL(`${GITHUB_REPO_URL}/issues/new`);
  const path = input?.pathname?.trim();
  const lines = ['**What happened**', '', '**Steps to reproduce**', ''];
  if (path) {
    lines.push(`**Page:** \`${path}\``);
  }
  url.searchParams.set('body', lines.join('\n'));
  return url.toString();
}

export function openGitHubBugReport(): void {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : undefined;
  window.open(githubBugReportUrl({ pathname }), '_blank', 'noopener,noreferrer');
}
