import type { ParserFn } from "./types.js";
import type { ParserId } from "../config.js";
import { parseAmazonQ } from "./amazon-q.js";
import { parseOpsgenie } from "./opsgenie.js";
import { parseEmailSns } from "./email-sns.js";

const PARSERS: Record<ParserId, ParserFn> = {
  "amazon-q": parseAmazonQ,
  "opsgenie": parseOpsgenie,
  "email-sns": parseEmailSns,
};

export function getParser(id: ParserId): ParserFn {
  return PARSERS[id];
}
