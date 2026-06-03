import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMember,
  type User,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { db } from "../db.js";
import { sendModlog } from "../features/modlog.js";

export const moderationCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Advanced moderation tools")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName("warn")
        .setDescription("Warn a user")
        .addUserOption((opt) => opt.setName("user").setDescription("Target user").setRequired(true))
        .addStringOption((opt) => opt.setName("reason").setDescription("Reason").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("timeout")
        .setDescription("Timeout a user")
        .addUserOption((opt) => opt.setName("user").setDescription("Target user").setRequired(true))
        .addIntegerOption((opt) =>
          opt
            .setName("minutes")
            .setDescription("Duration in minutes")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(40320),
        )
        .addStringOption((opt) => opt.setName("reason").setDescription("Reason").setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("kick")
        .setDescription("Kick a user")
        .addUserOption((opt) => opt.setName("user").setDescription("Target user").setRequired(true))
        .addStringOption((opt) => opt.setName("reason").setDescription("Reason").setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("ban")
        .setDescription("Ban a user")
        .addUserOption((opt) => opt.setName("user").setDescription("Target user").setRequired(true))
        .addStringOption((opt) => opt.setName("reason").setDescription("Reason").setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("purge")
        .setDescription("Bulk delete messages")
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("How many messages")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100),
        ),
    ) as unknown as BotCommand["data"],
  execute: async (interaction) => {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild only command.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const actor = interaction.user;

    const getTargetMember = async () => {
      const target = interaction.options.getMember("user") as GuildMember | null;
      if (!target) {
        throw new Error("Target member not found.");
      }
      return target;
    };

    if (sub === "warn") {
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason", true);
      await db.warning.create({
        data: {
          guildId: interaction.guild.id,
          userId: user.id,
          moderatorId: actor.id,
          reason,
        },
      });

      await interaction.reply({ content: `Warned ${user.tag}.`, ephemeral: true });
      await sendModlog(interaction.guild, "User Warned", `${user} warned by ${actor}.\nReason: ${reason}`, "Yellow");
      return;
    }

    if (sub === "timeout") {
      const target = await getTargetMember();
      const minutes = interaction.options.getInteger("minutes", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      await target.timeout(minutes * 60_000, reason);
      await interaction.reply({ content: `${target.user.tag} timed out for ${minutes}m.`, ephemeral: true });
      await sendModlog(interaction.guild, "User Timed Out", `${target} timed out by ${actor}.\nDuration: ${minutes}m\nReason: ${reason}`, "Orange");
      return;
    }

    if (sub === "kick") {
      const target = await getTargetMember();
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      await target.kick(reason);
      await interaction.reply({ content: `${target.user.tag} was kicked.`, ephemeral: true });
      await sendModlog(interaction.guild, "User Kicked", `${target.user.tag} kicked by ${actor}.\nReason: ${reason}`, "Red");
      return;
    }

    if (sub === "ban") {
      const target = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      await interaction.guild.members.ban(target as User, { reason });
      await interaction.reply({ content: `${target.tag} was banned.`, ephemeral: true });
      await sendModlog(interaction.guild, "User Banned", `${target.tag} banned by ${actor}.\nReason: ${reason}`, "DarkRed");
      return;
    }

    const amount = interaction.options.getInteger("amount", true);
    const messages = await interaction.channel?.messages.fetch({ limit: amount });
    if (!messages || !("bulkDelete" in interaction.channel!)) {
      await interaction.reply({ content: "Cannot purge here.", ephemeral: true });
      return;
    }

    // bulkDelete exists on text based guild channels and removes messages in one operation.
    await (interaction.channel as any).bulkDelete(messages, true);
    await interaction.reply({ content: `Deleted ${messages.size} messages.`, ephemeral: true });
    await sendModlog(interaction.guild, "Messages Purged", `${actor} purged ${messages.size} messages in <#${interaction.channelId}>.`);
  },
};
