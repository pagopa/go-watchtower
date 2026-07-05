import type { SlackParserId } from "../constants/slack-ingestor-automation.js";

export interface SlackParserLabel {
  label: string;
  description: string;
}

/** Label e descrizione dei parser Slack, condivise tra form e pannelli. */
export const SLACK_PARSER_LABELS: Record<SlackParserId, SlackParserLabel> = {
  "amazon-q": {
    label: "Amazon Q",
    description: "Messaggi pubblicati dal bot Amazon Q Developer nel canale.",
  },
  "opsgenie": {
    label: "Opsgenie",
    description: "Notifiche di allarme inoltrate dall'integrazione Opsgenie.",
  },
  "email-sns": {
    label: "Email SNS",
    description: "Email di notifica CloudWatch/SNS inoltrate su Slack.",
  },
  "jsm": {
    label: "Jira Service Management",
    description:
      "Ticket di allarme creati dall'integrazione Jira Service Management.",
  },
};
