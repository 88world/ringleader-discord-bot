# Ringleader - Discord All Purpose Bot

Monorepo with:
- Discord bot (TypeScript + discord.js + Prisma)
- Dashboard website (React + Vite)

## Features Included
- Ticket system
- Reaction role panel
- Rules embed system
- Modlogs
- Advanced moderation commands
- Advanced embed builder (JSON-driven)
- Welcome system
- Autorole system
- YouTube tracking skeleton + cron worker
- Twitter/X tracking skeleton
- Dashboard API + frontend starter

## Quick Start
1. Copy `apps/bot/.env.example` to `apps/bot/.env` and fill values.
2. Copy `apps/dashboard/.env.example` to `apps/dashboard/.env`.
3. In Discord Developer Portal, set OAuth redirect URI to `DISCORD_REDIRECT_URI`.
4. In `apps/bot`, run `npx prisma migrate dev --name init`.
5. Register slash commands: `npm run register -w apps/bot`.
6. Start bot: `npm run dev:bot`.
7. Start dashboard: `npm run dev:dashboard`.

## Notes
- Twitter API access is intentionally pluggable because X API tiers change frequently.
- AutoMod rules are managed from dashboard and enforced in real time on message create.
- OAuth dashboard sessions are stored in database and secured by `SESSION_SECRET`.

## Railway Deployment Notes
- Use PostgreSQL on Railway and set `DATABASE_URL` accordingly.
- Set `DASHBOARD_PUBLIC_URL` to the public dashboard domain.
- Set `DISCORD_REDIRECT_URI` to `https://<your-bot-domain>/auth/discord/callback`.
- Set `VITE_API_BASE` in dashboard service to bot API public URL.
