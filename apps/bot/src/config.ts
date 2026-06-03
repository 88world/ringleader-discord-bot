import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_REDIRECT_URI: z.string().url(),
  DISCORD_GUILD_ID: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  BOT_API_PORT: z.coerce.number().default(8080),
  DASHBOARD_PUBLIC_URL: z.string().url().default("http://localhost:5173"),
  SESSION_SECRET: z.string().min(16),
  YOUTUBE_POLL_CRON: z.string().default("*/10 * * * *"),
  TWITTER_POLL_CRON: z.string().default("*/15 * * * *"),
});

export const env = envSchema.parse(process.env);
