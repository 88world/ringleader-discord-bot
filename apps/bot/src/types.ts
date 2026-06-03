import type { ChatInputCommandInteraction, Client } from "discord.js";

export type BotCommand = {
  data: {
    name: string;
    description: string;
    toJSON: () => unknown;
  };
  execute: (
    interaction: ChatInputCommandInteraction,
    client: Client,
  ) => Promise<void>;
};
