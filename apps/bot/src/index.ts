import cron from "node-cron";
import {
  ActivityType,
  AuditLogEvent,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Partials,
  type GuildTextBasedChannel,
  type TextChannel,
} from "discord.js";
import { env } from "./config.js";
import { commandMap } from "./commands/index.js";
import { logger } from "./logger.js";
import { db } from "./db.js";
import { openTicketForMember, closeTicketByChannel } from "./features/tickets.js";
import { sendModlog } from "./features/modlog.js";
import { sendModlogEmbed } from "./features/modlog.js";
import { getGuildConfig } from "./utils/guildConfig.js";
import { pollTrackers } from "./features/trackers.js";
import { startDashboardApi } from "./web/api.js";
import { runAutoModForMessage } from "./features/automod.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel],
});

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Logged in as ${readyClient.user.tag}`);

  readyClient.user.setPresence({
    activities: [{ name: "community systems", type: ActivityType.Watching }],
  });

  cron.schedule(env.YOUTUBE_POLL_CRON, () => pollTrackers(readyClient, "youtube"));
  cron.schedule(env.TWITTER_POLL_CRON, () => pollTrackers(readyClient, "twitter"));

  startDashboardApi(readyClient);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = commandMap.get(interaction.commandName);
      if (!cmd) {
        return;
      }
      await cmd.execute(interaction, client);
      return;
    }

    if (interaction.isButton()) {
      if (!interaction.guild) {
        await interaction.reply({ content: "Guild only action.", ephemeral: true });
        return;
      }

      if (interaction.customId === "ticket:create") {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const ch = await openTicketForMember(interaction.guild, member);
        await interaction.reply({ content: `Ticket opened: <#${ch.id}>`, ephemeral: true });
        return;
      }

      if (interaction.customId === "ticket:close") {
        const closed = await closeTicketByChannel(interaction.guild, interaction.channelId);
        await interaction.reply({
          content: closed ? "Ticket closing..." : "This channel is not an active ticket.",
          ephemeral: true,
        });
      }
    }
  } catch (error) {
    logger.error({ error }, "Interaction handler failed");
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({ content: "An error occurred.", ephemeral: true });
    }
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  const cfg = await getGuildConfig(member.guild.id);

  if (cfg.autoroleId) {
    await member.roles.add(cfg.autoroleId).catch(() => null);
  }

  if (cfg.welcomeEnabled && cfg.welcomeChannelId) {
    const ch = member.guild.channels.cache.get(cfg.welcomeChannelId);
    if (ch && ch.type === ChannelType.GuildText) {
      const dot = "<:dot:1511471263183278141>";
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Welcome to ${member.guild.name}, ${member.user.username}!`)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setDescription(
          `Before you begin exploring, please take a moment to read through <#${cfg.rulesChannelId ?? "rules"}> to ensure a respectful and enjoyable environment for everyone.\n\nHere's a quick guide to the main areas of the server:\n\n` +
          `${dot} <#1377600737365856388> → Official news, updates, and important information from the team.\n\n` +
          `${dot} <#1374331795956437177> → A hub for verified links and any other resources.\n\n` +
          `${dot} <#1374331795956437178> → Stay up to date with our latest posts and highlights from the community.\n\n` +
          `Take your time to look around, get familiar with the channels, and feel free to join the conversation. We're glad to have you with us in the server.`,
        )
        .setFooter({ text: `Member #${member.guild.memberCount}` })
        .setTimestamp();
      await (ch as TextChannel).send({ content: `${member}`, embeds: [embed] });
    }
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot || !reaction.message.guild) {
    return;
  }

  const guild = reaction.message.guild;
  const emoji = reaction.emoji.toString();
  const messageId = reaction.message.id;

  const mapping = await db.reactionRole.findFirst({
    where: {
      guildId: guild.id,
      messageId,
      emoji,
    },
  });

  if (!mapping) {
    return;
  }

  const member = await guild.members.fetch(user.id);
  await member.roles.add(mapping.roleId).catch(() => null);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot || !reaction.message.guild) {
    return;
  }

  const guild = reaction.message.guild;
  const emoji = reaction.emoji.toString();
  const messageId = reaction.message.id;

  const mapping = await db.reactionRole.findFirst({
    where: {
      guildId: guild.id,
      messageId,
      emoji,
    },
  });

  if (!mapping) {
    return;
  }

  const member = await guild.members.fetch(user.id);
  await member.roles.remove(mapping.roleId).catch(() => null);
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.guild || !message.author || message.author.bot) {
    return;
  }

  const ghost = ghostPingCache.get(message.id);
  if (ghost) {
    ghostPingCache.delete(message.id);
    await sendModlog(
      message.guild,
      "👻 Ghost Ping Detected",
      `**Author:** <@${ghost.authorId}> (${ghost.authorTag})\n**Channel:** <#${ghost.channelId}>\n**Pinged:** ${ghost.mentions.join(", ")}\n**Content:** ${message.content?.slice(0, 900) || "(unknown)"}`,
      0x9b59b6,
    );
    return;
  }

  await sendModlog(
    message.guild,
    "🗑️ Message Deleted",
    `**Author:** ${message.author.tag} (<@${message.author.id}>)\n**Channel:** <#${message.channelId}>\n**Content:** ${message.content?.slice(0, 900) || "(empty or unknown)"}`,
    0x95a5a6,
  );
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild || !newMessage.author || newMessage.author.bot) return;
  if (oldMessage.content === newMessage.content) return;

  await sendModlog(
    newMessage.guild,
    "✏️ Message Edited",
    `**Author:** ${newMessage.author.tag} (<@${newMessage.author.id}>)\n**Channel:** <#${newMessage.channelId}>\n**Before:** ${oldMessage.content?.slice(0, 450) || "(unknown)"}\n**After:** ${newMessage.content?.slice(0, 450) || "(empty)"}`,
    0x3498db,
  );
});

client.on(Events.MessageBulkDelete, async (messages, channel) => {
  if (!channel.guild) return;
  await sendModlog(
    channel.guild,
    "🧹 Bulk Message Delete",
    `**Channel:** <#${channel.id}>\n**Count:** ${messages.size} messages deleted`,
    0x7f8c8d,
  );
});

client.on(Events.GuildMemberRemove, async (member) => {
  let wasKicked = false;
  let kickReason = "No reason provided";
  let kickModerator = "Unknown";

  try {
    const auditLogs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
    const entry = auditLogs.entries.first();
    if (entry && entry.target?.id === member.id && Date.now() - entry.createdTimestamp < 5_000) {
      wasKicked = true;
      kickReason = entry.reason ?? "No reason provided";
      kickModerator = entry.executor?.tag ?? "Unknown";
    }
  } catch { /* audit log unavailable */ }

  if (wasKicked) {
    await sendModlog(
      member.guild,
      "👢 Member Kicked",
      `**User:** ${member.user.tag} (<@${member.id}>)\n**Moderator:** ${kickModerator}\n**Reason:** ${kickReason}`,
      0xe67e22,
    );
  } else {
    await sendModlog(
      member.guild,
      "👋 Member Left",
      `**User:** ${member.user.tag} (<@${member.id}>)\n**ID:** ${member.id}\n**Members now:** ${member.guild.memberCount}`,
      0x95a5a6,
    );
  }
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (newMember.user.bot) return;

  // Nickname change
  if (oldMember.nickname !== newMember.nickname) {
    await sendModlog(
      newMember.guild,
      "📝 Nickname Changed",
      `**User:** ${newMember.user.tag} (<@${newMember.id}>)\n**Before:** ${oldMember.nickname ?? "(none)"}\n**After:** ${newMember.nickname ?? "(none)"}`,
      0xf39c12,
    );
  }

  // Timeout applied or removed
  const oldTimeout = oldMember.communicationDisabledUntil;
  const newTimeout = newMember.communicationDisabledUntil;
  if (oldTimeout?.getTime() !== newTimeout?.getTime()) {
    if (newTimeout && newTimeout > new Date()) {
      await sendModlog(
        newMember.guild,
        "🔇 Member Timed Out",
        `**User:** ${newMember.user.tag} (<@${newMember.id}>)\n**Until:** <t:${Math.floor(newTimeout.getTime() / 1000)}:F>`,
        0xe74c3c,
      );
    } else if (oldTimeout && (!newTimeout || newTimeout <= new Date())) {
      await sendModlog(
        newMember.guild,
        "🔊 Timeout Removed",
        `**User:** ${newMember.user.tag} (<@${newMember.id}>)`,
        0x2ecc71,
      );
    }
  }

  // Role changes
  const addedRoles = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
  const removedRoles = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));

  if (addedRoles.size > 0) {
    await sendModlog(
      newMember.guild,
      "➕ Role Added",
      `**User:** ${newMember.user.tag} (<@${newMember.id}>)\n**Roles:** ${addedRoles.map((r) => `<@&${r.id}>`).join(", ")}`,
      0x2ecc71,
    );
  }

  if (removedRoles.size > 0) {
    await sendModlog(
      newMember.guild,
      "➖ Role Removed",
      `**User:** ${newMember.user.tag} (<@${newMember.id}>)\n**Roles:** ${removedRoles.map((r) => `<@&${r.id}>`).join(", ")}`,
      0xe74c3c,
    );
  }
});

client.on(Events.GuildBanAdd, async (ban) => {
  let reason = "No reason provided";
  let moderator = "Unknown";

  try {
    const auditLogs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
    const entry = auditLogs.entries.first();
    if (entry && entry.target?.id === ban.user.id) {
      reason = entry.reason ?? "No reason provided";
      moderator = entry.executor?.tag ?? "Unknown";
    }
  } catch { /* audit log unavailable */ }

  await sendModlog(
    ban.guild,
    "🔨 Member Banned",
    `**User:** ${ban.user.tag} (<@${ban.user.id}>)\n**Moderator:** ${moderator}\n**Reason:** ${reason}`,
    0xe74c3c,
  );
});

client.on(Events.GuildBanRemove, async (ban) => {
  let moderator = "Unknown";

  try {
    const auditLogs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 });
    const entry = auditLogs.entries.first();
    if (entry && entry.target?.id === ban.user.id) {
      moderator = entry.executor?.tag ?? "Unknown";
    }
  } catch { /* audit log unavailable */ }

  await sendModlog(
    ban.guild,
    "✅ Member Unbanned",
    `**User:** ${ban.user.tag} (<@${ban.user.id}>)\n**Moderator:** ${moderator}`,
    0x2ecc71,
  );
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;
  const guild = newState.guild;

  if (!oldState.channelId && newState.channelId) {
    await sendModlog(
      guild,
      "🔊 Voice Joined",
      `**User:** ${member.user.tag} (<@${member.id}>)\n**Channel:** <#${newState.channelId}>`,
      0x2ecc71,
    );
  } else if (oldState.channelId && !newState.channelId) {
    await sendModlog(
      guild,
      "🔇 Voice Left",
      `**User:** ${member.user.tag} (<@${member.id}>)\n**Channel:** <#${oldState.channelId}>`,
      0xe74c3c,
    );
  } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    await sendModlog(
      guild,
      "🔀 Voice Moved",
      `**User:** ${member.user.tag} (<@${member.id}>)\n**From:** <#${oldState.channelId}> → **To:** <#${newState.channelId}>`,
      0x3498db,
    );
  }
});

// Ghost ping cache: track messages with user mentions so we can detect deletions
type GhostPingEntry = { authorId: string; authorTag: string; channelId: string; mentions: string[] };
const ghostPingCache = new Map<string, GhostPingEntry>();

client.on(Events.MessageCreate, async (message) => {
  await runAutoModForMessage(message).catch(() => null);

  if (message.guild && !message.author.bot && message.mentions.users.size > 0) {
    const mentions = message.mentions.users.map((u) => `<@${u.id}>`);
    ghostPingCache.set(message.id, {
      authorId: message.author.id,
      authorTag: message.author.tag,
      channelId: message.channelId,
      mentions,
    });
    // Auto-expire after 30 seconds
    setTimeout(() => ghostPingCache.delete(message.id), 30_000);
  }
});

process.on("SIGINT", async () => {
  await db.$disconnect();
  client.destroy();
  process.exit(0);
});

logger.info(`Attempting login with token ending in ...${env.DISCORD_TOKEN.slice(-6)}`);
client.login(env.DISCORD_TOKEN).catch((error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error({ message: err.message, name: err.name, stack: err.stack }, "Failed to login");
  process.exit(1);
});
