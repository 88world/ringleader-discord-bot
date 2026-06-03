import {
  type ColorResolvable,
  EmbedBuilder,
  TextChannel,
  type Guild,
} from "discord.js";
import { getGuildConfig } from "../utils/guildConfig.js";

const getModlogChannel = async (guild: Guild): Promise<TextChannel | null> => {
  const config = await getGuildConfig(guild.id);
  if (!config.modlogChannelId) return null;
  const channel = guild.channels.cache.get(config.modlogChannelId);
  if (!channel || !(channel instanceof TextChannel)) return null;
  return channel;
};

export const sendModlog = async (
  guild: Guild,
  title: string,
  description: string,
  color: ColorResolvable = "Blue",
) => {
  const channel = await getModlogChannel(guild);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
};

export const sendModlogEmbed = async (guild: Guild, embed: EmbedBuilder) => {
  const channel = await getModlogChannel(guild);
  if (!channel) return;
  await channel.send({ embeds: [embed] });
};
