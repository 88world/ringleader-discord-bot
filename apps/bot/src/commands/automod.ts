import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.js";
import { seedAutoModPresets } from "../features/automod.js";

export const automodCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("AutoMod management")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Seed all preset AutoMod rules for this server"),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const count = await seedAutoModPresets(interaction.guild.id);

    if (count === 0) {
      await interaction.editReply(
        "All preset rules are already configured. You can manage them via the dashboard.",
      );
      return;
    }

    await interaction.editReply(
      `✅ Seeded **${count}** preset AutoMod rules.\n\n` +
        `**Active by default:**\n` +
        `• **Block Discord Invites** — deletes invite links instantly\n` +
        `• **Spam Protection** — 5 msgs in 6 s → 10 min timeout\n` +
        `• **Excessive Caps** — 70 %+ caps × 3 in 2 min → warn\n` +
        `• **Mass Mention** — 5+ user/role mentions → 30 min timeout\n` +
        `• **Anti-Phishing** — phishing / free-nitro links → 60 min timeout\n` +
        `• **Anti-Selfbot Spam** — invite + mass-ping combos → 60 min timeout\n\n` +
        `**Disabled — configure in dashboard before enabling:**\n` +
        `• **Profanity Filter** — set your keyword list, then enable\n` +
        `• **Link Filter** — blocks all URLs (enable per server as needed)\n\n` +
        `Tip: exempt staff roles via the dashboard so moderators aren't affected.`,
    );
  },
};
