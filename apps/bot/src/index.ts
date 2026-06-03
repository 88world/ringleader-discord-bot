import cron from "node-cron";
import {
  ActivityType,
  ChannelType,
  Client,
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
import { getGuildConfig } from "./utils/guildConfig.js";
import { pollTrackers } from "./features/trackers.js";
import { startDashboardApi } from "./web/api.js";
import { runAutoModForMessage } from "./features/automod.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
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
      await (ch as TextChannel).send(`Welcome to the server, ${member}!`);
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

  await sendModlog(
    message.guild,
    "Message Deleted",
    `Author: ${message.author.tag}\nChannel: <#${message.channelId}>\nContent: ${message.content?.slice(0, 900) || "(empty)"}`,
    "Grey",
  );
});

client.on(Events.MessageCreate, async (message) => {
  await runAutoModForMessage(message).catch(() => null);
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
