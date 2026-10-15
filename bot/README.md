# Telegram lobby service

This standalone Node service handles `/start` lobby creation, invite links, membership, mutually exclusive Hunter/Witch role claims, and authoritative multiplayer turns. It keeps only one active session globally: creating a new one closes the previous lobby. `/stop` closes the latest active session; its creator or either joined player can run the command. It uses Telegram long polling and persists lobby and game state to `bot/data/sessions.json`.

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
6. Open the bot and use the app's **Invite a friend** option. The bot creates a lobby and gives you a deep link to share. Both players join and choose different roles. The taken role is displayed as unavailable in the updated lobby message; the server also rejects conflicting claims. Once both roles are chosen, each player opens the game from the bot's lobby message. The bot service validates moves, stores one shared game state, and sends each browser only the information visible to that role. Use `/stop` to close the latest active lobby. Creating another lobby closes the previous one automatically.

Keep `TELEGRAM_BOT_TOKEN` only in the server environment and never commit it. The read-only session endpoint verifies Telegram's signed `initData` and checks membership. Local polling and production webhook mode should not run at the same time for one bot token.

## Current boundary

The session service uses the same engine as the solo game, but validates and stores multiplayer actions on the server. Hunter clients receive a redacted state that hides the Witch's position; the Witch client receives the full board state needed to play that role. Keep the deployed bot service and game on the same code version.
