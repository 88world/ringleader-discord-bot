import {
  ChannelType,
  Colors,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type TextChannel,
  type NewsChannel,
} from "discord.js";
import type { BotCommand } from "../types.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function targetChannel(
  interaction: Parameters<BotCommand["execute"]>[0],
  fallback: TextChannel | NewsChannel,
): TextChannel | NewsChannel {
  const opt = interaction.options.getChannel("channel");
  if (opt && (opt.type === ChannelType.GuildText || opt.type === ChannelType.GuildAnnouncement)) {
    return opt as TextChannel | NewsChannel;
  }
  return fallback;
}

// ─── /rules ───────────────────────────────────────────────────────────────────

export const rulesCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Post the server rules embed")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("rules")
        .setDescription("Rules text — use \\n to separate lines")
        .setRequired(false),
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to post in (defaults to current)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ) as unknown as BotCommand["data"],

  execute: async (interaction) => {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild only.", ephemeral: true });
      return;
    }

    const current = interaction.channel as TextChannel | NewsChannel;
    const dest = targetChannel(interaction, current);
    const customRules = interaction.options.getString("rules");

    const defaultRules = [
      "**1. Respect everyone.** Treat all members with kindness. Harassment, hate speech, and discrimination are not tolerated.",
      "**2. No spam or flooding.** Don't send repeated messages, excessive emojis, or walls of text.",
      "**3. Keep content appropriate.** No NSFW content outside of designated channels. This is a community server.",
      "**4. No advertising.** Do not promote other servers, social media, or services without staff approval.",
      "**5. Use channels correctly.** Post content in the appropriate channel. Check pinned messages for guidance.",
      "**6. No sharing personal information.** Do not share your own or others' personal details.",
      "**7. Follow Discord's ToS.** All members must comply with [Discord's Terms of Service](https://discord.com/terms).",
      "**8. Listen to staff.** Moderator and admin decisions are final. If you disagree, open a ticket.",
    ].join("\n\n");

    const rulesText = customRules ? customRules.replace(/\\n/g, "\n") : defaultRules;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📋 Server Rules")
      .setDescription(rulesText)
      .setFooter({ text: "Breaking rules may result in a warning, timeout, or permanent ban." })
      .setTimestamp();

    await dest.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Rules embed posted in ${dest}.`, ephemeral: true });
  },
};

// ─── /welcome ─────────────────────────────────────────────────────────────────

export const welcomePanelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Post the server welcome & info embed")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("description")
        .setDescription("Custom description (optional)")
        .setRequired(false),
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to post in (defaults to current)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ) as unknown as BotCommand["data"],

  execute: async (interaction) => {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild only.", ephemeral: true });
      return;
    }

    const current = interaction.channel as TextChannel | NewsChannel;
    const dest = targetChannel(interaction, current);
    const customDesc = interaction.options.getString("description");

    const desc =
      customDesc ??
      `Welcome to **${interaction.guild.name}**! We're glad you're here.\n\n` +
        `🗂️ Browse our channels to find your way around.\n` +
        `📋 Read <#rules> before participating.\n` +
        `🎭 Head to <#roles> to pick up some roles.\n` +
        `💬 Introduce yourself and jump into the conversation!\n\n` +
        `If you need help, open a support ticket anytime.`;

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`👋 Welcome to ${interaction.guild.name}!`)
      .setDescription(desc)
      .setThumbnail(interaction.guild.iconURL({ size: 256 }) ?? null)
      .setFooter({ text: interaction.guild.name })
      .setTimestamp();

    await dest.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Welcome embed posted in ${dest}.`, ephemeral: true });
  },
};

// ─── /announce ────────────────────────────────────────────────────────────────

export const announceCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post a styled announcement embed")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt.setName("title").setDescription("Announcement title").setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("message")
        .setDescription("Announcement body — use \\n for new lines")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("color")
        .setDescription("Embed color")
        .setRequired(false)
        .addChoices(
          { name: "Yellow (default)", value: "yellow" },
          { name: "Red", value: "red" },
          { name: "Green", value: "green" },
          { name: "Blue", value: "blue" },
          { name: "Purple", value: "purple" },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName("image")
        .setDescription("Image URL to attach at the bottom")
        .setRequired(false),
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to post in (defaults to current)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ) as unknown as BotCommand["data"],

  execute: async (interaction) => {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild only.", ephemeral: true });
      return;
    }

    const current = interaction.channel as TextChannel | NewsChannel;
    const dest = targetChannel(interaction, current);
    const title = interaction.options.getString("title", true);
    const message = interaction.options.getString("message", true).replace(/\\n/g, "\n");
    const colorChoice = interaction.options.getString("color") ?? "yellow";
    const image = interaction.options.getString("image");

    const colorMap: Record<string, number> = {
      yellow: Colors.Yellow,
      red: Colors.Red,
      green: Colors.Green,
      blue: Colors.Blue,
      purple: 0x9b59b6,
    };

    const embed = new EmbedBuilder()
      .setColor(colorMap[colorChoice] ?? Colors.Yellow)
      .setTitle(`📢 ${title}`)
      .setDescription(message)
      .setFooter({ text: `Posted by ${interaction.user.tag}` })
      .setTimestamp();

    if (image) embed.setImage(image);

    await dest.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Announcement posted in ${dest}.`, ephemeral: true });
  },
};

// ─── /serverinfo ──────────────────────────────────────────────────────────────

export const serverInfoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Post server stats & info embed")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to post in (defaults to current)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ) as unknown as BotCommand["data"],

  execute: async (interaction) => {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild only.", ephemeral: true });
      return;
    }

    const guild = interaction.guild;
    await guild.fetch();

    const current = interaction.channel as TextChannel | NewsChannel;
    const dest = targetChannel(interaction, current);

    const owner = await guild.fetchOwner().catch(() => null);
    const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
    const roles = guild.roles.cache.size - 1; // exclude @everyone
    const boosts = guild.premiumSubscriptionCount ?? 0;
    const boostTier = guild.premiumTier;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🏠 ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
      .addFields(
        { name: "👑 Owner", value: owner ? `${owner.user.tag}` : "Unknown", inline: true },
        { name: "🆔 Server ID", value: guild.id, inline: true },
        { name: "📅 Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: "👥 Members", value: `${guild.memberCount}`, inline: true },
        { name: "💬 Text Channels", value: `${textChannels}`, inline: true },
        { name: "🔊 Voice Channels", value: `${voiceChannels}`, inline: true },
        { name: "🎭 Roles", value: `${roles}`, inline: true },
        { name: "✨ Boosts", value: `${boosts} (Tier ${boostTier})`, inline: true },
        {
          name: "🌍 Verification Level",
          value: ["None", "Low", "Medium", "High", "Very High"][guild.verificationLevel] ?? "Unknown",
          inline: true,
        },
      )
      .setImage(guild.bannerURL({ size: 1024 }) ?? null)
      .setFooter({ text: `${guild.name} • Server Information` })
      .setTimestamp();

    await dest.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Server info posted in ${dest}.`, ephemeral: true });
  },
};

// ─── /rolesinfo ───────────────────────────────────────────────────────────────

export const rolesInfoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("rolesinfo")
    .setDescription("Post a roles & how-to-get-them embed")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("content")
        .setDescription("Describe available roles — use \\n for new lines")
        .setRequired(false),
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to post in (defaults to current)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ) as unknown as BotCommand["data"],

  execute: async (interaction) => {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild only.", ephemeral: true });
      return;
    }

    const current = interaction.channel as TextChannel | NewsChannel;
    const dest = targetChannel(interaction, current);
    const customContent = interaction.options.getString("content");

    const defaultContent =
      "React to messages in this channel or use our role menus to pick up roles.\n\n" +
      "🎮 **Gamer** — Gaming discussion access\n" +
      "🎨 **Creative** — Art & creative channels\n" +
      "📢 **Announcements** — Get pinged for announcements\n" +
      "🔔 **Events** — Get pinged for community events\n\n" +
      "*More roles may be available — check the reaction role panels below.*";

    const content = customContent ? customContent.replace(/\\n/g, "\n") : defaultContent;

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("🎭 Server Roles")
      .setDescription(content)
      .setFooter({ text: "Use reaction roles or bots commands to self-assign roles." })
      .setTimestamp();

    await dest.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Roles info posted in ${dest}.`, ephemeral: true });
  },
};

// ─── /faq ─────────────────────────────────────────────────────────────────────

export const faqCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("faq")
    .setDescription("Post a FAQ embed")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("content")
        .setDescription("FAQ content — use \\n for new lines")
        .setRequired(false),
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to post in (defaults to current)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ) as unknown as BotCommand["data"],

  execute: async (interaction) => {
    if (!interaction.guild) {
      await interaction.reply({ content: "Guild only.", ephemeral: true });
      return;
    }

    const current = interaction.channel as TextChannel | NewsChannel;
    const dest = targetChannel(interaction, current);
    const customContent = interaction.options.getString("content");

    const defaultContent = [
      "**Q: How do I get roles?**\nHead to the roles channel and react to the role panel, or check pinned messages.",
      "**Q: How do I open a support ticket?**\nGo to the tickets channel and click the button, or use `/ticket open`.",
      "**Q: I found a bug / have a suggestion.**\nPost it in the appropriate channel or open a ticket.",
      "**Q: How do I appeal a punishment?**\nOpen a ticket addressed to staff and explain your situation.",
      "**Q: What are the server rules?**\nRead the rules channel. Ignorance of the rules is not an excuse.",
    ].join("\n\n");

    const content = customContent ? customContent.replace(/\\n/g, "\n") : defaultContent;

    const embed = new EmbedBuilder()
      .setColor(0xeb459e)
      .setTitle("❓ Frequently Asked Questions")
      .setDescription(content)
      .setFooter({ text: "Can't find your answer? Open a support ticket." })
      .setTimestamp();

    await dest.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ FAQ posted in ${dest}.`, ephemeral: true });
  },
};
