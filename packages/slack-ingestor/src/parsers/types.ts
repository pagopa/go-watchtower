import type { ConversationsHistoryResponse } from "@slack/web-api";

export type Message = NonNullable<
  ConversationsHistoryResponse["messages"]
>[number];

export interface ParsedAlarmEvent {
  name: string;
  firedAt: Date;
  awsRegion: string;
  awsAccountId: string;
  description: string | null;
  reason: string | null;
}

/** Returns null when the message should be skipped (OK state, unrecognized format, thread reply). */
export type ParserFn = (
  message: Message,
  defaults: ChannelDefaults,
) => ParsedAlarmEvent | null;

export interface ChannelDefaults {
  defaultAwsAccountId: string;
  defaultAwsRegion?: string | undefined;
}
