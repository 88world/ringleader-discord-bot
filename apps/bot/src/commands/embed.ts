import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import type { BotCommand } from "../types.js";
import { db } from "../db.js";

const payloadSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  color: z.number().optional(),
  image: z.object({ url: z.string().url() }).optional(),
  thumbnail: z.object({ url: z.string().url() }).optional(),
  footer: z.object({ text: z.string() }).optional(),
});

export const embedCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Advanced embed system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName("send")
        .setDescription("Send a fully custom embed via JSON")
        .addStringOption((opt) =>
          opt
            .setName("payload")
            .setDescription("JSON payload for EmbedBuilder")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("save")
        .setDescription("Save an embed preset")
        .addStringOption((opt) => opt.setName("name").setDescription("Preset name").setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName("payload")
            .setDescription("JSON payload for EmbedBuilder")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("use")
        .setDescription("Send a saved preset")
        .addStringOption((opt) => opt.setName("name").setDescription("Preset name").setRequired(true)),
    ) as unknown as BotCommand["data"],
  execute: async (interaction) => {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild only command.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "use") {
      const name = interaction.options.getString("name", true);
      const preset = await db.embedPreset.findUnique({
        where: {
          guildId_name: {
            guildId: interaction.guild.id,
            name,
          },
        },
      });

      if (!preset) {
        await interaction.reply({ content: "Preset not found.", ephemeral: true });
        return;
      }

      const payload = JSON.parse(preset.payloadJson) as Record<string, unknown>;
      const embed = new EmbedBuilder(payload);
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased() || !("send" in channel)) {
        await interaction.reply({ content: "Cannot send embed in this channel.", ephemeral: true });
        return;
      }

      await channel.send({ embeds: [embed] });
      await interaction.reply({ content: "Preset sent.", ephemeral: true });
      return;
    }

    const payloadRaw = interaction.options.getString("payload", true);

    let parsed: z.infer<typeof payloadSchema>;
    try {
      parsed = payloadSchema.parse(JSON.parse(payloadRaw));
    } catch {
      await interaction.reply({ content: "Invalid JSON payload.", ephemeral: true });
      return;
    }

    if (sub === "save") {
      const name = interaction.options.getString("name", true);
      await db.embedPreset.upsert({
        where: {
          guildId_name: {
            guildId: interaction.guild.id,
            name,
          },
        },
        update: {
          payloadJson: JSON.stringify(parsed),
        },
        create: {
          guildId: interaction.guild.id,
          name,
          payloadJson: JSON.stringify(parsed),
          createdBy: interaction.user.id,
        },
      });

      await interaction.reply({ content: `Preset ${name} saved.`, ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder(parsed);
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      await interaction.reply({ content: "Cannot send embed in this channel.", ephemeral: true });
      return;
    }

    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: "Embed sent.", ephemeral: true });
  },
};
