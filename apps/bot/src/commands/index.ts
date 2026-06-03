import type { BotCommand } from "../types.js";
import { embedCommand } from "./embed.js";
import { moderationCommand } from "./moderation.js";
import { reactionRoleCommand } from "./reactionrole.js";
import { setupCommand } from "./setup.js";
import { ticketCommand } from "./ticket.js";
import { trackerCommand } from "./tracker.js";

export const commands: BotCommand[] = [
  setupCommand,
  ticketCommand,
  moderationCommand,
  embedCommand,
  reactionRoleCommand,
  trackerCommand,
];

export const commandMap = new Map(commands.map((cmd) => [cmd.data.name, cmd]));
