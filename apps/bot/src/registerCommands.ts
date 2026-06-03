import { REST, Routes } from "discord.js";
import { env } from "./config.js";
import { commands } from "./commands/index.js";
import { logger } from "./logger.js";

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

const payload = commands.map((cmd) => cmd.data.toJSON());

const register = async () => {
  if (env.DISCORD_GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID),
      { body: payload },
    );
    logger.info("Registered guild slash commands.");
    return;
  }

  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: payload });
  logger.info("Registered global slash commands.");
};

register().catch((error) => {
  logger.error({ error }, "Failed to register slash commands");
  process.exit(1);
});
