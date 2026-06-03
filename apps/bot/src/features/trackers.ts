import axios from "axios";
import { ChannelType, EmbedBuilder, type Client, type TextChannel } from "discord.js";
import { db } from "../db.js";
import { logger } from "../logger.js";

const parseLatestYoutubeVideoId = (xml: string): string | null => {
  const match = xml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
  return match?.[1] ?? null;
};

const parseLatestRssGuid = (xml: string): string | null => {
  const match = xml.match(/<guid[^>]*>([^<]+)<\/guid>/);
  return match?.[1] ?? null;
};

export const pollTrackers = async (client: Client, kind: "youtube" | "twitter") => {
  const trackers = await db.tracker.findMany({ where: { kind } });

  for (const tracker of trackers) {
    try {
      let latestId: string | null = null;
      let url = "";

      if (kind === "youtube") {
        url = `https://www.youtube.com/feeds/videos.xml?channel_id=${tracker.sourceId}`;
      } else {
        // Use RSS proxy/feed style sourceId or provide one via metaJson.
        url = tracker.metaJson ?? tracker.sourceId;
      }

      const res = await axios.get<string>(url, {
        responseType: "text",
        timeout: 15000,
      });

      latestId = kind === "youtube" ? parseLatestYoutubeVideoId(res.data) : parseLatestRssGuid(res.data);

      if (!latestId || latestId === tracker.lastKnownContentId) {
        continue;
      }

      const guild = client.guilds.cache.get(tracker.guildId);
      if (!guild) {
        continue;
      }

      const channel = guild.channels.cache.get(tracker.destinationChannel);
      if (!channel || channel.type !== ChannelType.GuildText) {
        continue;
      }

      const out = channel as TextChannel;
      const urlOut =
        kind === "youtube"
          ? `https://www.youtube.com/watch?v=${latestId}`
          : latestId;

      const embed = new EmbedBuilder()
        .setTitle(kind === "youtube" ? "New YouTube Upload" : "New Twitter/X Post")
        .setDescription(`New content detected: ${urlOut}`)
        .setColor(kind === "youtube" ? "Red" : "Aqua")
        .setTimestamp();

      await out.send({ embeds: [embed] });

      await db.tracker.update({
        where: { id: tracker.id },
        data: { lastKnownContentId: latestId },
      });
    } catch (error) {
      logger.error({ error, trackerId: tracker.id }, "Failed polling tracker");
    }
  }
};
