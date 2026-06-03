import axios from "axios";
import { ChannelType, type Client, type TextChannel } from "discord.js";
import { db } from "../db.js";
import { env } from "../config.js";
import { logger } from "../logger.js";

const parseLatestYoutubeVideoId = (xml: string): string | null => {
  const match = xml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
  return match?.[1] ?? null;
};

// ─── Twitter API v2 types ────────────────────────────────────────────────────

type TwitterUserResponse = { data: { id: string; username: string } };
type TwitterTweetsResponse = { data?: Array<{ id: string; text: string }> };

type TrackerMeta = { userId?: string };

const twitterHeaders = () => ({
  Authorization: `Bearer ${env.TWITTER_BEARER_TOKEN}`,
});

const resolveTwitterUserId = async (username: string, trackerId: string): Promise<string | null> => {
  const res = await axios.get<TwitterUserResponse>(
    `https://api.twitter.com/2/users/by/username/${username}`,
    { headers: twitterHeaders(), timeout: 15_000 },
  );
  const userId = res.data.data.id;
  // Cache the numeric user ID so we never look it up again
  await db.tracker.update({
    where: { id: trackerId },
    data: { metaJson: JSON.stringify({ userId }) },
  });
  return userId;
};

const pollTwitter = async (
  tracker: { id: string; sourceId: string; metaJson: string | null; lastKnownContentId: string | null },
): Promise<{ latestId: string; tweetUrl: string } | null> => {
  if (!env.TWITTER_BEARER_TOKEN) {
    logger.warn({ trackerId: tracker.id }, "TWITTER_BEARER_TOKEN not set — skipping twitter tracker");
    return null;
  }

  const meta: TrackerMeta = tracker.metaJson ? (JSON.parse(tracker.metaJson) as TrackerMeta) : {};
  const userId = meta.userId ?? (await resolveTwitterUserId(tracker.sourceId, tracker.id));
  if (!userId) return null;

  const res = await axios.get<TwitterTweetsResponse>(
    `https://api.twitter.com/2/users/${userId}/tweets`,
    {
      headers: twitterHeaders(),
      params: {
        max_results: 5,
        exclude: "retweets,replies",
        "tweet.fields": "created_at",
      },
      timeout: 15_000,
    },
  );

  const tweets = res.data.data;
  if (!tweets || tweets.length === 0) return null;

  const latestId = tweets[0].id;
  if (latestId === tracker.lastKnownContentId) return null;

  return {
    latestId,
    tweetUrl: `https://x.com/${tracker.sourceId}/status/${latestId}`,
  };
};

// ─── Main poll loop ──────────────────────────────────────────────────────────

export const pollTrackers = async (client: Client, kind: "youtube" | "twitter") => {
  const trackers = await db.tracker.findMany({ where: { kind } });

  for (const tracker of trackers) {
    try {
      const guild = client.guilds.cache.get(tracker.guildId);
      if (!guild) continue;

      const channel = guild.channels.cache.get(tracker.destinationChannel);
      if (!channel || channel.type !== ChannelType.GuildText) continue;

      const out = channel as TextChannel;

      if (kind === "youtube") {
        const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${tracker.sourceId}`;
        const res = await axios.get<string>(url, { responseType: "text", timeout: 15_000 });
        const latestId = parseLatestYoutubeVideoId(res.data);

        if (!latestId || latestId === tracker.lastKnownContentId) continue;

        await out.send(`https://www.youtube.com/watch?v=${latestId}`);
        await db.tracker.update({ where: { id: tracker.id }, data: { lastKnownContentId: latestId } });
        continue;
      }

      // Twitter
      const result = await pollTwitter(tracker);
      if (!result) continue;

      // Send just the URL — Discord renders it as a tweet card
      await out.send(result.tweetUrl);
      await db.tracker.update({
        where: { id: tracker.id },
        data: { lastKnownContentId: result.latestId },
      });
    } catch (error) {
      logger.error({ error, trackerId: tracker.id }, "Failed polling tracker");
    }
  }
};
