/**
 * Deduce il tipo di link dall'URL (Slack, GitHub, Jira, etc.).
 * Funzione pura senza dipendenze.
 */
export function inferLinkType(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?([^/?#:]+)(?::\d+)?([^?#]*)/i.exec(url);
  if (!match) return 'Link';

  const [, rawHost = '', rawPath = ''] = match;
  const host = rawHost.toLowerCase();
  const path = rawPath.toLowerCase();

  const hostMatches = (suffix: string): boolean =>
    host === suffix || host.endsWith(`.${suffix}`);

  if (hostMatches('slack.com') && path.startsWith('/archives')) return 'Slack Thread';
  if (hostMatches('github.com') && path.includes('/issues/')) return 'GitHub Issue';
  if (hostMatches('github.com') && path.includes('/pull/')) return 'GitHub PR';
  if (hostMatches('atlassian.net') && path.includes('/browse/')) return 'Jira Ticket';
  if (host.includes('confluence') || path.includes('/wiki/')) return 'Confluence Page';
  if (hostMatches('opsgenie.com')) return 'Opsgenie Alert';
  return 'Link';
}
