# Railway Deployment Guide

This project is deployed as **two services** from one repository:

- Bot API + Discord worker service
- Dashboard web service

## 1) Create Services

Create two Railway services from this same GitHub repository:

- Service A: `ringleader-bot`
- Service B: `ringleader-dashboard`

## 2) Bot Service Settings

- Root directory: repository root
- Build command: `npm run railway:bot:build`
- Start command: `npm run railway:bot:start`

### Bot Environment Variables

Set the following in Railway for the bot service:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI` = `https://<BOT_DOMAIN>/auth/discord/callback`
- `DISCORD_GUILD_ID` (optional)
- `DATABASE_URL` (from Railway Postgres)
- `BOT_API_PORT` = `8080`
- `DASHBOARD_PUBLIC_URL` = `https://<DASHBOARD_DOMAIN>`
- `SESSION_SECRET` (long random string)
- `NODE_ENV` = `production`
- `YOUTUBE_POLL_CRON` (optional)
- `TWITTER_POLL_CRON` (optional)

## 3) PostgreSQL

Add a Railway PostgreSQL service and connect `DATABASE_URL` to the bot service.

Migrations are committed under [apps/bot/prisma/migrations](../apps/bot/prisma/migrations) and are automatically applied in `start:railway` via:

- `prisma migrate deploy`

## 4) Dashboard Service Settings

- Root directory: repository root
- Build command: `npm run railway:dashboard:build`
- Start command: `npm run railway:dashboard:start`

### Dashboard Environment Variables

- `VITE_API_BASE` = `https://<BOT_DOMAIN>`

## 5) Discord OAuth Setup

In Discord Developer Portal for your bot application:

- Add redirect URL: `https://<BOT_DOMAIN>/auth/discord/callback`

This must match `DISCORD_REDIRECT_URI` exactly.

## 6) Validation Checklist

- Dashboard opens and "Sign in with Discord" works
- `/auth/me` succeeds after login
- Guild list appears in dashboard
- Saving core config works
- Creating AutoMod rule works
- Bot logs show successful Discord login and API listen
