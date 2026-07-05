import type { SlackParserId } from "@go-watchtower/shared";
import type { ParserFn } from "./types.js";
import { parseAmazonQ } from "./amazon-q.js";
import { parseOpsgenie } from "./opsgenie.js";
import { parseEmailSns } from "./email-sns.js";
import { parseJiraServiceManagement } from "./jira-service-management.js";

const PARSERS: Record<SlackParserId, ParserFn> = {
  "amazon-q": parseAmazonQ,
  "opsgenie": parseOpsgenie,
  "email-sns": parseEmailSns,
  "jsm": parseJiraServiceManagement,
};

export function getParser(id: SlackParserId): ParserFn {
  return PARSERS[id];
}
