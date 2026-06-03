import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.js";
import { db } from "../db.js";

export const trackerCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tracker")
    .setDescription("Track YouTube and Twitter/X")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("youtube")
        .setDescription("Track a YouTube channel")
        .addStringOption((opt) =>
          opt
            .setName("channel_id")
            .setDescription("YouTube channel ID")
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName("destination")
            .setDescription("Where updates should be posted")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("twitter")
        .setDescription("Track a Twitter/X account (requires TWITTER_BEARER_TOKEN)")
        .addStringOption((opt) =>
          opt
            .setName("handle")
            .setDescription("Twitter/X username without @, e.g. showofsouls")
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName("destination")
            .setDescription("Where updates should be posted")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List trackers")) as unknown as BotCommand["data"],
  execute: async (interaction) => {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild only command.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    if (sub === "list") {
      const rows = await db.tracker.findMany({
        where: { guildId: interaction.guild.id },
      });

      if (rows.length === 0) {
        await interaction.reply({ content: "No trackers configured.", ephemeral: true });
        return;
      }

      const content = rows
        .map((x: { kind: string; sourceId: string; destinationChannel: string }) => `${x.kind}: ${x.sourceId} -> <#${x.destinationChannel}>`)
        .join("\n");
      await interaction.reply({ content, ephemeral: true });
      return;
    }

    const destination = interaction.options.getChannel("destination", true);

    if (sub === "youtube") {
      const channelId = interaction.options.getString("channel_id", true);
      await db.tracker.upsert({
        where: {
          guildId_kind_sourceId: {
            guildId: interaction.guild.id,
            kind: "youtube",
            sourceId: channelId,
          },
        },
        update: { destinationChannel: destination.id },
        create: {
          guildId: interaction.guild.id,
          kind: "youtube",
          sourceId: channelId,
          destinationChannel: destination.id,
        },
      });

      await interaction.reply({ content: "YouTube tracker saved.", ephemeral: true });
      return;
    }

    const feedUrl = interaction.options.getString("feed_url");
    const handle = interaction.options.getString("handle", true);

    await db.tracker.upsert({
      where: {
        guildId_kind_sourceId: {
          guildId: interaction.guild.id,
          kind: "twitter",
          sourceId: handle,
        },
      },
      update: {
        destinationChannel: destination.id,
        metaJson: feedUrl ?? null,
      },
      create: {
        guildId: interaction.guild.id,
        kind: "twitter",
        sourceId: handle,
        destinationChannel: destination.id,
        metaJson: feedUrl ?? null,
      },
    });

    await interaction.reply({ content: "Twitter/X tracker saved.", ephemeral: true });
  },
};
