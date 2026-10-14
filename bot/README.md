# Telegram lobby service

This standalone Node service handles `/start` lobby creation, invite links, membership, and mutually exclusive Hunter/Witch role claims. It uses Telegram long polling and persists lobby records to `bot/data/sessions.json`.

## Configure

1. In Telegram, create a bot with **@BotFather** and copy its token. Note the bot username.
2. Host the game at a public HTTPS URL. In **@BotFather → Bot Settings → Menu Button**, set that URL as the Mini App URL. (For a production deployment, set the domain with `/setdomain` if BotFather requests it.)
   Also put the bot username (without `@`) in the `telegram-bot-username` meta tag in `index.html` before building/deploying the static game.
3. Run this service on a public host that can make outbound HTTPS requests. Give it a persistent disk/volume for `bot/data/sessions.json`.
4. Set these environment variables on the service:

   - `TELEGRAM_BOT_TOKEN` — token from BotFather
   - `TELEGRAM_BOT_USERNAME` — bot username without `@`
   - `PUBLIC_URL` — public HTTPS URL of this service
   - `MINI_APP_URL` — public HTTPS URL of the game page
   - `PORT` — optional; defaults to `8788`
   - `SESSION_DB` — optional; defaults to `bot/data/sessions.json`
   - `CORS_ORIGIN` — optional; set to the exact game origin in production

5. Start it with `npm run bot`. Check `https://<service-host>/health` for `{"ok":true}`.
6. Open the bot and send `/start`, then use the app's **Invite a friend** option. The bot creates a lobby and gives you a deep link to share. Both players join and choose different roles. The taken role is displayed as unavailable in the updated lobby message; the server also rejects conflicting claims.

Keep `TELEGRAM_BOT_TOKEN` only in the server environment and never commit it. The read-only session endpoint verifies Telegram's signed `initData` and checks membership. Local polling and production webhook mode should not run at the same time for one bot token.

## Current boundary

The lobby and role assignment are server-managed. The existing game engine still runs locally in each browser; synchronized turns, reconnectable authoritative game state, and server-side enforcement of hidden information are not implemented yet. Do not treat this lobby integration as a complete online match until that game-state transport is added.
