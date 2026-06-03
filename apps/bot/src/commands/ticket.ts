import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type CategoryChannel,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { closeTicketByChannel, createTicketPanel } from "../features/tickets.js";
import { updateGuildConfig } from "../utils/guildConfig.js";

export const ticketCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
      sub
        .setName("panel")
        .setDescription("Create a ticket panel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Where the panel should be posted")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName("category")
            .setDescription("Category for created tickets")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName("close").setDescription("Close current ticket")) as unknown as BotCommand["data"],
  execute: async (interaction) => {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild only command.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    if (sub === "panel") {
      const channel = interaction.options.getChannel("channel", true);
      const category = interaction.options.getChannel("category") as CategoryChannel | null;

      if (category) {
        await updateGuildConfig(interaction.guild.id, {
          ticketCategoryId: category.id,
        });
      }

      await createTicketPanel(interaction.guild, channel.id);
      await interaction.reply({ content: "Ticket panel created.", ephemeral: true });
      return;
    }

    const closed = await closeTicketByChannel(interaction.guild, interaction.channelId);
    await interaction.reply({
      content: closed ? "Ticket closed." : "This is not an active ticket channel.",
      ephemeral: true,
    });
  },
};
