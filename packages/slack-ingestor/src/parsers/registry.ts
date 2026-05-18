import type { ParserFn } from "./types.js";
import type { ParserId } from "../config.js";
import { parseAmazonQ } from "./amazon-q.js";
import { parseOpsgenie } from "./opsgenie.js";
import { parseEmailSns } from "./email-sns.js";
import { parseJiraServiceManagement } from "./jira-service-management.js";

const PARSERS: Record<ParserId, ParserFn> = {
  "amazon-q": parseAmazonQ,
  "opsgenie": parseOpsgenie,
  "email-sns": parseEmailSns,
  "jsm": parseJiraServiceManagement,
};

export function getParser(id: ParserId): ParserFn {
  return PARSERS[id];
}
