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

const shouldTriggerRule = (kind: string, pattern: string, content: string) => {
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

    if (!shouldTriggerRule(rule.kind, rule.pattern, message.content)) {
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

    if (rule.action === "delete") {
      await message.delete().catch(() => null);
      await sendModlog(
        message.guild,
        "AutoMod Deleted Message",
        `Rule: ${rule.name}\nUser: ${message.author.tag}\nChannel: <#${message.channelId}>\nContent: ${message.content.slice(0, 900) || "(empty)"}`,
        "Orange",
      );
      return;
    }

    if (rule.action === "timeout") {
      await message.member.timeout(rule.timeoutMinutes * 60_000, `AutoMod: ${rule.name}`).catch(() => null);
      await message.delete().catch(() => null);
      await sendModlog(
        message.guild,
        "AutoMod Timeout",
        `Rule: ${rule.name}\nUser: ${message.author.tag}\nDuration: ${rule.timeoutMinutes}m\nContent: ${message.content.slice(0, 900) || "(empty)"}`,
        "Red",
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
      "AutoMod Warning",
      `Rule: ${rule.name}\nUser: ${message.author.tag}\nChannel: <#${message.channelId}>\nContent: ${message.content.slice(0, 900) || "(empty)"}`,
      "Yellow",
    );
    return;
  }
};
