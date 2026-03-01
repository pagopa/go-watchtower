/**
 * Deduce il tipo di link dall'URL (Slack, GitHub, Jira, etc.).
 * Funzione pura senza dipendenze.
 */
export function inferLinkType(url: string): string {
  if (url.includes('slack.com/archives')) return 'Slack Thread';
  if (url.includes('github.com') && url.includes('/issues/')) return 'GitHub Issue';
  if (url.includes('github.com') && url.includes('/pull/')) return 'GitHub PR';
  if (url.includes('.atlassian.net') && url.includes('/browse/')) return 'Jira Ticket';
  if (url.includes('confluence')) return 'Confluence Page';
  if (url.includes('opsgenie.com')) return 'Opsgenie Alert';
  return 'Link';
}
