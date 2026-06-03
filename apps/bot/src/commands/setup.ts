import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type TextChannel,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { updateGuildConfig } from "../utils/guildConfig.js";

export const setupCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure server systems")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("channels")
        .setDescription("Set key channels")
        .addChannelOption((opt) =>
          opt
            .setName("rules")
            .setDescription("Rules channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addChannelOption((opt) =>
          opt
            .setName("welcome")
            .setDescription("Welcome channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addChannelOption((opt) =>
          opt
            .setName("modlogs")
            .setDescription("Modlogs channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addRoleOption((opt) =>
          opt
            .setName("autorole")
            .setDescription("Role to auto-assign on join")
            .setRequired(false),
        )
        .addBooleanOption((opt) =>
          opt
            .setName("welcome_enabled")
            .setDescription("Enable or disable welcome system")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("rulesembed")
        .setDescription("Post server rules embed")
        .addStringOption((opt) =>
          opt
            .setName("title")
            .setDescription("Rules title")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("body")
            .setDescription("Rules text")
            .setRequired(true),
        ),
    ) as unknown as BotCommand["data"],
  execute: async (interaction) => {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild only command.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "channels") {
      const rules = interaction.options.getChannel("rules");
      const welcome = interaction.options.getChannel("welcome");
      const modlogs = interaction.options.getChannel("modlogs");
      const autorole = interaction.options.getRole("autorole");
      const welcomeEnabled = interaction.options.getBoolean("welcome_enabled");

      await updateGuildConfig(interaction.guild.id, {
        rulesChannelId: rules?.id ?? undefined,
        welcomeChannelId: welcome?.id ?? undefined,
        modlogChannelId: modlogs?.id ?? undefined,
        autoroleId: autorole?.id ?? undefined,
        welcomeEnabled: welcomeEnabled ?? undefined,
      });

      await interaction.reply({
        content: "Server configuration updated.",
        ephemeral: true,
      });
      return;
    }

    if (sub === "rulesembed") {
      const title = interaction.options.getString("title", true);
      const body = interaction.options.getString("body", true);

      const channel = interaction.channel as TextChannel;
      if (!channel) {
        await interaction.reply({ content: "Invalid channel.", ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(body)
        .setColor("Gold")
        .setFooter({ text: "Rules" });

      await channel.send({ embeds: [embed] });
      await interaction.reply({ content: "Rules embed posted.", ephemeral: true });
    }
  },
};
