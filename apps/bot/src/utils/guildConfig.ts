import { db } from "../db.js";

export const getGuildConfig = async (guildId: string) => {
  return db.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: { guildId },
  });
};

export const updateGuildConfig = async (
  guildId: string,
  update: Partial<{
    rulesChannelId: string | null;
    welcomeChannelId: string | null;
    modlogChannelId: string | null;
    ticketCategoryId: string | null;
    autoroleId: string | null;
    welcomeEnabled: boolean;
    ticketPanelId: string | null;
  }>,
) => {
  return db.guildConfig.upsert({
    where: { guildId },
    update,
    create: {
      guildId,
      ...update,
    },
  });
};
