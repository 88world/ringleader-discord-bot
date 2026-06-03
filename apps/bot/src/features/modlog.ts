import {
  type ColorResolvable,
  EmbedBuilder,
  TextChannel,
  type Guild,
} from "discord.js";
import { getGuildConfig } from "../utils/guildConfig.js";

export const sendModlog = async (
  guild: Guild,
  title: string,
  description: string,
  color: ColorResolvable = "Blue",
) => {
  const config = await getGuildConfig(guild.id);
  if (!config.modlogChannelId) {
    return;
  }

  const channel = guild.channels.cache.get(config.modlogChannelId);
  if (!channel || !(channel instanceof TextChannel)) {
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
};
