import { PermissionFlagsBits, type Message } from "discord.js";
import { db } from "../db.js";
import { sendModlog } from "./modlog.js";

type CounterState = {
  count: number;
  firstAt: number;
};

const spamCounters = new Map<string, CounterState>();

const keyFor = (guildId: string, ruleId: string, userId: string) => `${guildId}:${ruleId}:${userId}`;

const includesInviteLink = (content: string) =>
  /(discord\.gg\/|discordapp\.com\/invite\/|discord\.com\/invite\/)/i.test(content);

const isExcessiveCaps = (content: string, thresholdPct: number): boolean => {
  if (content.length < 10) return false;
  const letters = content.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 5) return false;
  const caps = content.replace(/[^A-Z]/g, "");
  return (caps.length / letters.length) * 100 >= thresholdPct;
};

const shouldTriggerRule = (kind: string, pattern: string, message: Message): boolean => {
  const content = message.content;

  if (kind === "keyword") {
    return content.toLowerCase().includes(pattern.toLowerCase());
  }

  if (kind === "regex") {
    try {
      const re = new RegExp(pattern, "i");
      return re.test(content);
    } catch {
      return false;
    }
  }

  if (kind === "invite") {
    return includesInviteLink(content);
  }

  if (kind === "spam") {
    // always triggers — threshold/window controls when action fires
    return true;
  }

  if (kind === "caps") {
    const pct = parseInt(pattern, 10) || 70;
    return isExcessiveCaps(content, pct);
  }

  if (kind === "mass_mention") {
    const max = parseInt(pattern, 10) || 5;
    return message.mentions.users.size + message.mentions.roles.size >= max;
  }

  if (kind === "links") {
    return /https?:\/\//i.test(content);
  }

  return false;
};

export const runAutoModForMessage = async (message: Message) => {
  if (!message.guild || !message.member || message.author.bot) {
    return;
  }

  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return;
  }

  const rules = await db.autoModRule.findMany({
    where: {
      guildId: message.guild.id,
      enabled: true,
    },
  });

  if (rules.length === 0) {
    return;
  }

  for (const rule of rules) {
    const exemptRoleIds = rule.exemptRoleIds ? (JSON.parse(rule.exemptRoleIds) as string[]) : [];
    if (exemptRoleIds.some((roleId) => message.member?.roles.cache.has(roleId))) {
      continue;
    }

    if (!shouldTriggerRule(rule.kind, rule.pattern, message)) {
      continue;
    }

    const key = keyFor(message.guild.id, rule.id, message.author.id);
    const now = Date.now();
    const existing = spamCounters.get(key);
    const current: CounterState =
      !existing || now - existing.firstAt > rule.windowSeconds * 1000
        ? { count: 1, firstAt: now }
        : { count: existing.count + 1, firstAt: existing.firstAt };

    spamCounters.set(key, current);

    if (current.count < rule.threshold) {
      continue;
    }

    // Reset counter so the window starts fresh after punishment
    spamCounters.delete(key);

    if (rule.action === "delete") {
      await message.delete().catch(() => null);
      await sendModlog(
        message.guild,
        "🛡️ AutoMod — Message Deleted",
        `**Rule:** ${rule.name}\n**User:** ${message.author.tag} (<@${message.author.id}>)\n**Channel:** <#${message.channelId}>\n**Content:** ${message.content.slice(0, 900) || "(empty)"}`,
        0xf5a623,
      );
      return;
    }

    if (rule.action === "timeout") {
      await message.member.timeout(rule.timeoutMinutes * 60_000, `AutoMod: ${rule.name}`).catch(() => null);
      await message.delete().catch(() => null);
      await sendModlog(
        message.guild,
        "🔇 AutoMod — User Timed Out",
        `**Rule:** ${rule.name}\n**User:** ${message.author.tag} (<@${message.author.id}>)\n**Duration:** ${rule.timeoutMinutes}m\n**Channel:** <#${message.channelId}>\n**Content:** ${message.content.slice(0, 900) || "(empty)"}`,
        0xe74c3c,
      );
      return;
    }

    await db.warning.create({
      data: {
        guildId: message.guild.id,
        userId: message.author.id,
        moderatorId: message.guild.members.me?.id ?? "automod",
        reason: `AutoMod rule triggered: ${rule.name}`,
      },
    });

    await sendModlog(
      message.guild,
      "⚠️ AutoMod — Warning Issued",
      `**Rule:** ${rule.name}\n**User:** ${message.author.tag} (<@${message.author.id}>)\n**Channel:** <#${message.channelId}>\n**Content:** ${message.content.slice(0, 900) || "(empty)"}`,
      0xf1c40f,
    );
    return;
  }
};

// ─── Preset rules ────────────────────────────────────────────────────────────

const PRESET_RULES: Array<{
  name: string;
  kind: string;
  pattern: string;
  action: string;
  threshold: number;
  windowSeconds: number;
  timeoutMinutes: number;
  enabled: boolean;
}> = [
  {
    name: "Block Discord Invites",
    kind: "invite",
    pattern: "",
    action: "delete",
    threshold: 1,
    windowSeconds: 60,
    timeoutMinutes: 10,
    enabled: true,
  },
  {
    name: "Spam Protection",
    kind: "spam",
    pattern: "",
    action: "timeout",
    threshold: 5,
    windowSeconds: 6,
    timeoutMinutes: 10,
    enabled: true,
  },
  {
    name: "Excessive Caps",
    kind: "caps",
    pattern: "70", // 70% caps threshold
    action: "warn",
    threshold: 3,
    windowSeconds: 120,
    timeoutMinutes: 5,
    enabled: true,
  },
  {
    name: "Mass Mention",
    kind: "mass_mention",
    pattern: "5", // 5+ user/role mentions
    action: "timeout",
    threshold: 1,
    windowSeconds: 60,
    timeoutMinutes: 30,
    enabled: true,
  },
  {
    name: "Anti-Phishing",
    kind: "regex",
    pattern:
      "(discord\\.gift\\/|free.*nitro|nitro.*free|claim.*reward|verify.*account|steamcommunity\\.com\\/tradeoffer\\/new)",
    action: "timeout",
    threshold: 1,
    windowSeconds: 60,
    timeoutMinutes: 60,
    enabled: true,
  },
  {
    name: "Anti-Selfbot Spam",
    kind: "regex",
    pattern: "(@everyone|@here).*discord\\.gg|discord\\.gg.*(@everyone|@here)",
    action: "timeout",
    threshold: 1,
    windowSeconds: 60,
    timeoutMinutes: 60,
    enabled: true,
  },
  {
    name: "Profanity Filter",
    kind: "keyword",
    pattern: "configure-me", // admin must set their word list via dashboard
    action: "warn",
    threshold: 1,
    windowSeconds: 60,
    timeoutMinutes: 5,
    enabled: false,
  },
  {
    name: "Link Filter",
    kind: "links",
    pattern: "",
    action: "delete",
    threshold: 1,
    windowSeconds: 60,
    timeoutMinutes: 10,
    enabled: false, // disabled by default — enable per channel as needed
  },
];

/**
 * Seeds default AutoMod rules for a guild. Skips rules that already exist.
 * Returns how many new rules were created.
 */
export const seedAutoModPresets = async (guildId: string): Promise<number> => {
  let seeded = 0;
  for (const preset of PRESET_RULES) {
    const existing = await db.autoModRule.findUnique({
      where: { guildId_name: { guildId, name: preset.name } },
    });
    if (!existing) {
      await db.autoModRule.create({ data: { guildId, ...preset } });
      seeded++;
    }
  }
  return seeded;
};
