import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import axios from "axios";
import type { NextFunction, Request, Response } from "express";
import type { Client } from "discord.js";
import { db } from "../db.js";
import { env } from "../config.js";

type DiscordUser = {
  id: string;
  username: string;
  discriminator: string;
};

type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  permissions: string;
};

const sessionCookieName = "ringleader_session";
const oauthStateCookie = "ringleader_oauth_state";

const parseCookies = (req: Request): Record<string, string> => {
  const raw = req.headers.cookie;
  if (!raw) {
    return {};
  }

  return raw.split(";").reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf("=");
    if (index < 0) {
      return acc;
    }
    const key = decodeURIComponent(part.slice(0, index).trim());
    const value = decodeURIComponent(part.slice(index + 1).trim());
    acc[key] = value;
    return acc;
  }, {});
};

const createSignedToken = (value: string) => {
  const signature = crypto.createHmac("sha256", env.SESSION_SECRET).update(value).digest("hex");
  return `${value}.${signature}`;
};

const verifySignedToken = (signedValue: string | undefined): string | null => {
  if (!signedValue || !signedValue.includes(".")) {
    return null;
  }

  const parts = signedValue.split(".");
  const signature = parts.pop() ?? "";
  const value = parts.join(".");
  const expected = crypto.createHmac("sha256", env.SESSION_SECRET).update(value).digest("hex");
  if (signature !== expected) {
    return null;
  }
  return value;
};

const setSessionCookie = (res: Response, sessionId: string) => {
  const signed = createSignedToken(sessionId);
  res.cookie(sessionCookieName, signed, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: "/",
  });
};

const clearSessionCookie = (res: Response) => {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
};

const toDiscordOauthGuilds = async (accessToken: string) => {
  const guildRes = await axios.get<DiscordGuild[]>("https://discord.com/api/users/@me/guilds", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return guildRes.data.map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.icon,
    isAdmin: (BigInt(guild.permissions) & 0x8n) === 0x8n,
  }));
};

const getSessionFromRequest = async (req: Request) => {
  const cookies = parseCookies(req);
  const sessionValue = verifySignedToken(cookies[sessionCookieName]);
  if (!sessionValue) {
    return null;
  }

  const session = await db.dashboardSession.findUnique({
    where: { id: sessionValue },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() < Date.now()) {
    await db.dashboardSession.delete({ where: { id: session.id } }).catch(() => null);
    return null;
  }

  return session;
};

type AuthedRequest = Request & {
  session: {
    id: string;
    userId: string;
    username: string;
    accessToken: string;
  };
};

const requireSession = async (req: Request, res: Response, next: NextFunction) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  (req as AuthedRequest).session = {
    id: session.id,
    userId: session.userId,
    username: session.username,
    accessToken: session.accessToken,
  };
  next();
};

const requireGuildAdmin = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  const guildId = String(req.params.guildId ?? "");
  const guilds = await toDiscordOauthGuilds(req.session.accessToken);
  const current = guilds.find((x) => x.id === guildId);

  if (!current || !current.isAdmin) {
    res.status(403).json({ error: "Missing admin permissions in target guild" });
    return;
  }

  next();
};

export const startDashboardApi = (client: Client) => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.DASHBOARD_PUBLIC_URL,
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get("/auth/discord/login", async (_req: Request, res: Response) => {
    const stateId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 10);

    await db.oAuthState.create({
      data: {
        id: stateId,
        expiresAt,
      },
    });

    res.cookie(oauthStateCookie, createSignedToken(stateId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 10,
      path: "/",
    });

    const params = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      redirect_uri: env.DISCORD_REDIRECT_URI,
      response_type: "code",
      scope: "identify guilds",
      state: stateId,
    });

    res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
  });

  app.get("/auth/discord/callback", async (req: Request, res: Response) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const cookies = parseCookies(req);
    const cookieState = verifySignedToken(cookies[oauthStateCookie]);

    if (!code || !state || !cookieState || cookieState !== state) {
      res.status(400).send("Invalid OAuth state");
      return;
    }

    const stateRow = await db.oAuthState.findUnique({ where: { id: state } });
    if (!stateRow || stateRow.expiresAt.getTime() < Date.now()) {
      res.status(400).send("OAuth state expired");
      return;
    }

    await db.oAuthState.delete({ where: { id: state } }).catch(() => null);

    try {
      const tokenBody = new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: env.DISCORD_REDIRECT_URI,
      });

      const tokenRes = await axios.post<{
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      }>("https://discord.com/api/oauth2/token", tokenBody.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const meRes = await axios.get<DiscordUser>("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${tokenRes.data.access_token}`,
        },
      });

      const session = await db.dashboardSession.create({
        data: {
          userId: meRes.data.id,
          username: `${meRes.data.username}#${meRes.data.discriminator}`,
          accessToken: tokenRes.data.access_token,
          refreshToken: tokenRes.data.refresh_token,
          expiresAt: new Date(Date.now() + tokenRes.data.expires_in * 1000),
        },
      });

      setSessionCookie(res, session.id);
      res.redirect(env.DASHBOARD_PUBLIC_URL);
    } catch {
      res.status(500).send("OAuth exchange failed");
    }
  });

  app.get("/auth/me", requireSession, async (req: Request, res: Response) => {
    const authedReq = req as AuthedRequest;
    const guilds = await toDiscordOauthGuilds(authedReq.session.accessToken);
    res.json({
      user: {
        id: authedReq.session.userId,
        username: authedReq.session.username,
      },
      guilds,
    });
  });

  app.post("/auth/logout", requireSession, async (req: Request, res: Response) => {
    const authedReq = req as AuthedRequest;
    await db.dashboardSession.delete({ where: { id: authedReq.session.id } }).catch(() => null);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.use("/guilds/:guildId", requireSession, async (req: Request, res: Response, next: NextFunction) => {
    await requireGuildAdmin(req as AuthedRequest, res, next);
  });

  app.get("/guilds/:guildId/config", async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId ?? "");
    const config = await db.guildConfig.upsert({
      where: { guildId },
      update: {},
      create: { guildId },
    });

    res.json(config);
  });

  app.post("/guilds/:guildId/config", async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId ?? "");
    const data = req.body as Record<string, unknown>;

    const config = await db.guildConfig.upsert({
      where: { guildId },
      update: {
        rulesChannelId: (data.rulesChannelId as string | undefined) ?? undefined,
        welcomeChannelId: (data.welcomeChannelId as string | undefined) ?? undefined,
        modlogChannelId: (data.modlogChannelId as string | undefined) ?? undefined,
        ticketCategoryId: (data.ticketCategoryId as string | undefined) ?? undefined,
        autoroleId: (data.autoroleId as string | undefined) ?? undefined,
        welcomeEnabled: typeof data.welcomeEnabled === "boolean" ? data.welcomeEnabled : undefined,
      },
      create: {
        guildId,
        rulesChannelId: (data.rulesChannelId as string | undefined) ?? null,
        welcomeChannelId: (data.welcomeChannelId as string | undefined) ?? null,
        modlogChannelId: (data.modlogChannelId as string | undefined) ?? null,
        ticketCategoryId: (data.ticketCategoryId as string | undefined) ?? null,
        autoroleId: (data.autoroleId as string | undefined) ?? null,
        welcomeEnabled: typeof data.welcomeEnabled === "boolean" ? data.welcomeEnabled : false,
      },
    });

    res.json(config);
  });

  app.get("/guilds/:guildId/channels", async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId ?? "");
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      res.status(404).json({ error: "Guild not found by bot" });
      return;
    }

    const channels = await guild.channels.fetch();
    const textChannels = Array.from(channels.values())
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .filter((x) => x.type === 0 || x.type === 5)
      .map((x) => ({ id: x.id, name: x.name }));

    res.json(textChannels);
  });

  app.get("/guilds/:guildId/trackers", async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId ?? "");
    const trackers = await db.tracker.findMany({ where: { guildId } });
    res.json(trackers);
  });

  app.get("/guilds/:guildId/embeds", async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId ?? "");
    const presets = await db.embedPreset.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
    });

    res.json(presets);
  });

  app.post("/guilds/:guildId/embeds", async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId ?? "");
    const payload = req.body as {
      name: string;
      embed: Record<string, unknown>;
    };

    if (!payload.name || !payload.embed) {
      res.status(400).json({ error: "Missing name or embed payload" });
      return;
    }

    const created = await db.embedPreset.upsert({
      where: {
        guildId_name: {
          guildId,
          name: payload.name,
        },
      },
      update: {
        payloadJson: JSON.stringify(payload.embed),
      },
      create: {
        guildId,
        name: payload.name,
        payloadJson: JSON.stringify(payload.embed),
        createdBy: "dashboard",
      },
    });

    res.json(created);
  });

  app.post("/guilds/:guildId/embeds/preview", async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId ?? "");
    const payload = req.body as {
      channelId: string;
      embed: Record<string, unknown>;
    };

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      res.status(404).json({ error: "Guild not found in bot cache" });
      return;
    }

    const channel = guild.channels.cache.get(payload.channelId);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      res.status(400).json({ error: "Invalid destination channel" });
      return;
    }

    await channel.send({ embeds: [payload.embed] });
    res.json({ ok: true });
  });

  app.get("/guilds/:guildId/automod-rules", async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId ?? "");
    const rows = await db.autoModRule.findMany({ where: { guildId }, orderBy: { createdAt: "desc" } });
    res.json(rows);
  });

  app.post("/guilds/:guildId/automod-rules", async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId ?? "");
    const body = req.body as {
      name: string;
      kind: string;
      pattern: string;
      action: string;
      threshold?: number;
      windowSeconds?: number;
      timeoutMinutes?: number;
      exemptRoleIds?: string[];
      enabled?: boolean;
    };

    const created = await db.autoModRule.create({
      data: {
        guildId,
        name: body.name,
        kind: body.kind,
        pattern: body.pattern,
        action: body.action,
        threshold: body.threshold ?? 1,
        windowSeconds: body.windowSeconds ?? 60,
        timeoutMinutes: body.timeoutMinutes ?? 10,
        exemptRoleIds: body.exemptRoleIds ? JSON.stringify(body.exemptRoleIds) : null,
        enabled: body.enabled ?? true,
      },
    });

    res.json(created);
  });

  app.put("/guilds/:guildId/automod-rules/:ruleId", async (req: Request, res: Response) => {
    const ruleId = String(req.params.ruleId ?? "");
    const body = req.body as {
      name?: string;
      kind?: string;
      pattern?: string;
      action?: string;
      threshold?: number;
      windowSeconds?: number;
      timeoutMinutes?: number;
      exemptRoleIds?: string[];
      enabled?: boolean;
    };

    const updated = await db.autoModRule.update({
      where: { id: ruleId },
      data: {
        name: body.name,
        kind: body.kind,
        pattern: body.pattern,
        action: body.action,
        threshold: body.threshold,
        windowSeconds: body.windowSeconds,
        timeoutMinutes: body.timeoutMinutes,
        exemptRoleIds: body.exemptRoleIds ? JSON.stringify(body.exemptRoleIds) : undefined,
        enabled: body.enabled,
      },
    });

    res.json(updated);
  });

  app.delete("/guilds/:guildId/automod-rules/:ruleId", async (req: Request, res: Response) => {
    const ruleId = String(req.params.ruleId ?? "");
    await db.autoModRule.delete({ where: { id: ruleId } });
    res.json({ ok: true });
  });

  app.listen(env.BOT_API_PORT, () => {
    console.log(`Dashboard API listening on ${env.BOT_API_PORT}`);
  });
};
