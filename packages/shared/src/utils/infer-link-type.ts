/**
 * Deduce il tipo di link dall'URL (Slack, GitHub, Jira, etc.).
 * Funzione pura senza dipendenze.
 */
export function inferLinkType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('slack.com/archives')) return 'Slack Thread';
  if (lower.includes('github.com') && lower.includes('/issues/')) return 'GitHub Issue';
  if (lower.includes('github.com') && lower.includes('/pull/')) return 'GitHub PR';
  if (lower.includes('.atlassian.net') && lower.includes('/browse/')) return 'Jira Ticket';
  if (lower.includes('confluence') || lower.includes('/wiki/')) return 'Confluence Page';
  if (lower.includes('opsgenie.com')) return 'Opsgenie Alert';
  return 'Link';
}
