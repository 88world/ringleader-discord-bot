import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
  type Guild,
  type GuildMember,
} from "discord.js";
import { db } from "../db.js";
import { getGuildConfig } from "../utils/guildConfig.js";

export const createTicketPanel = async (guild: Guild, channelId: string) => {
  const channel = guild.channels.cache.get(channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error("Ticket panel channel must be a text channel.");
  }

  const embed = new EmbedBuilder()
    .setTitle("Support Tickets")
    .setDescription("Press the button below to open a support ticket.")
    .setColor("Blurple");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:create")
      .setLabel("Create Ticket")
      .setStyle(ButtonStyle.Primary),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  await db.guildConfig.upsert({
    where: { guildId: guild.id },
    update: { ticketPanelId: msg.id },
    create: { guildId: guild.id, ticketPanelId: msg.id },
  });
};

export const openTicketForMember = async (guild: Guild, member: GuildMember) => {
  const existing = await db.ticket.findFirst({
    where: {
      guildId: guild.id,
      ownerId: member.id,
      status: "open",
    },
  });

  if (existing) {
    const existingChannel = guild.channels.cache.get(existing.channelId);
    if (existingChannel && existingChannel instanceof TextChannel) {
      return existingChannel;
    }
  }

  const cfg = await getGuildConfig(guild.id);
  const ticketChannel = await guild.channels.create({
    name: `ticket-${member.user.username}`,
    type: ChannelType.GuildText,
    parent: cfg.ticketCategoryId ?? undefined,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ],
  });

  await db.ticket.create({
    data: {
      guildId: guild.id,
      ownerId: member.id,
      channelId: ticketChannel.id,
    },
  });

  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:close")
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger),
  );

  await ticketChannel.send({
    content: `${member}, support will be with you shortly.`,
    components: [closeRow],
  });

  return ticketChannel;
};

export const closeTicketByChannel = async (guild: Guild, channelId: string) => {
  const ticket = await db.ticket.findFirst({
    where: {
      guildId: guild.id,
      channelId,
      status: "open",
    },
  });

  if (!ticket) {
    return false;
  }

  await db.ticket.update({
    where: { id: ticket.id },
    data: {
      status: "closed",
      closedAt: new Date(),
    },
  });

  const ch = guild.channels.cache.get(channelId);
  if (ch && ch instanceof TextChannel) {
    await ch.delete("Ticket closed");
  }

  return true;
};
