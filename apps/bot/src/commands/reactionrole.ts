import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildTextBasedChannel,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { db } from "../db.js";

export const reactionRoleCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("reactionrole")
    .setDescription("Manage reaction roles")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Attach an emoji to a role on a message")
        .addStringOption((opt) => opt.setName("message_id").setDescription("Target message ID").setRequired(true))
        .addStringOption((opt) => opt.setName("emoji").setDescription("Emoji, e.g. ✅").setRequired(true))
        .addRoleOption((opt) => opt.setName("role").setDescription("Role to assign").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove reaction role mapping")
        .addStringOption((opt) => opt.setName("message_id").setDescription("Target message ID").setRequired(true))
        .addStringOption((opt) => opt.setName("emoji").setDescription("Emoji").setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List configured reaction roles")) as unknown as BotCommand["data"],
  execute: async (interaction) => {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild only command.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      const rows = await db.reactionRole.findMany({
        where: { guildId: interaction.guild.id },
      });

      if (rows.length === 0) {
        await interaction.reply({ content: "No reaction roles configured.", ephemeral: true });
        return;
      }

      const body = rows
        .map((x: { messageId: string; emoji: string; roleId: string }) => `Message: ${x.messageId} | Emoji: ${x.emoji} | Role: <@&${x.roleId}>`)
        .join("\n");
      await interaction.reply({ content: body, ephemeral: true });
      return;
    }

    const messageId = interaction.options.getString("message_id", true);
    const emoji = interaction.options.getString("emoji", true);

    if (sub === "remove") {
      await db.reactionRole.deleteMany({
        where: {
          guildId: interaction.guild.id,
          messageId,
          emoji,
        },
      });
      await interaction.reply({ content: "Reaction role removed.", ephemeral: true });
      return;
    }

    const role = interaction.options.getRole("role", true);
    const channel = interaction.channel as GuildTextBasedChannel;
    const msg = await channel.messages.fetch(messageId);
    await msg.react(emoji);

    await db.reactionRole.upsert({
      where: {
        guildId_messageId_emoji: {
          guildId: interaction.guild.id,
          messageId,
          emoji,
        },
      },
      update: { roleId: role.id },
      create: {
        guildId: interaction.guild.id,
        messageId,
        emoji,
        roleId: role.id,
      },
    });

    await interaction.reply({ content: "Reaction role added.", ephemeral: true });
  },
};
