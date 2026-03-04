import { prisma } from "@go-watchtower/database";

/** Returns the latest processed Slack ts for the given channel, or '0' if none. */
export async function getCursor(channelId: string): Promise<string> {
  const cursor = await prisma.slackChannelCursor.findUnique({
    where: { channelId },
  });
  return cursor?.latestTs ?? "0";
}

/** Persists the latest processed ts for the given channel. */
export async function saveCursor(
  channelId: string,
  latestTs: string,
): Promise<void> {
  await prisma.slackChannelCursor.upsert({
    where: { channelId },
    create: { channelId, latestTs },
    update: { latestTs },
  });
}
