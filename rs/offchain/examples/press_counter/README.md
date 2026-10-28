# PressCounterBot

A bot with a [MiniApp](../../../sdk/README.md#miniapp-cards): a button any member of a chat can press,
and a table of how many times each of them has.

- `/press` posts a card, "**Button presses** · tap Open to play". The card never changes.
- Its Open button, which OpenChat's website draws, opens the bot's app, `{endpoint}/app`, in a
  frame. That's [one HTML page](./src/app.html), with inline JS and no build step, which:
  - does the app's side of OpenChat's postMessage protocol: it sends `mini_app_ready`, takes the
    token from `initialise_mini_app`, asks for a new one (`mini_app_token_request`) a minute before
    it expires or when the bot answers a call with a 401, and follows `set_dark_mode`;
  - calls the bot's API with the token in the `x-oc-jwt` header, and polls it every 2 seconds, so
    everyone with the card open sees each other's presses.
- The API verifies the token with `BotMessageSession::parse`: that OpenChat signed it, that it's a
  `BotMessageSession` token, that it's for this bot and that it hasn't expired. It keeps the counts
  by the card, `(chat, thread, message_id)`, then by user, in memory, so they're lost when the bot is
  restarted.

| Route | Token | |
| --- | --- | --- |
| `POST /execute_command` | the command's | `/press` |
| `GET /app` | none | the app's page |
| `GET /api/presses` | the session's | the card's counts |
| `POST /api/press` | the session's | presses the button, then answers with the counts |
| `GET` anything else | none | the bot's definition |

The API answers `{ "user_id", "total", "presses": [{ "user_id", "count" }] }`, most presses first, or
`{ "error" }` with a 401 for a missing, invalid or expired token, or a 500 if the bot can't find out
its own id. The app shows each user by their id, shortened, as it has no usernames.

## Running it against a local OpenChat

You need an OpenChat with MiniApp cards (open-chat#10300), the `BotMessageSession` token and the
website's MiniApp frame, running locally, with the `open-chat` repo cloned next to this one:

```
open-chat-labs/
   |_open-chat
   |_open-chat-bots
```

### 1. Start OpenChat

In `open-chat`, checked out at a commit with MiniApp support, as its README says:

```bash
dfx start --clean --background            # the replica, on 127.0.0.1:8080
./scripts/deploy-local.sh default build   # builds the checkout's own wasms
npm --prefix frontend run dev             # the website, on http://localhost:5001
```

`deploy-local.sh` with no arguments installs the wasms CI built for the latest `master`, which only
have MiniApp support once it's merged.

Sign up on http://localhost:5001 and create a group to test in.

### 2. Run the bot

In `open-chat-bots`:

```bash
./rs/scripts/deploy_press_counter_bot.sh
```

which takes, all optional:

```bash
./rs/scripts/deploy_press_counter_bot.sh [identity, default press_counter_bot] [port, default 3100] [UserIndex canister id]
```

and the environment variables `OPEN_CHAT_DIR`, the `open-chat` checkout (default `../open-chat`, from
this repo's root, so set it when running from a worktree), and `OC_REPLICA_PORT` (default 8080) and
`OC_DEV_PORT` (default 5001), as OpenChat's own scripts take them. It:

- creates the dfx identity `press_counter_bot`, if there isn't one, which the bot signs its calls
  with, and exports it to `bot.pem`;
- reads **OpenChat's public key**, which it checks tokens with, from the website, at
  http://localhost:5001/public-key. The website's dev server writes it there from the local
  UserIndex when it starts, so run the script again whenever you redeploy OpenChat;
- finds the local **UserIndex** with `dfx canister id user_index` in `open-chat`. The bot asks it
  for its **own id**, the user id OpenChat gives it when it's registered (not its principal), the
  first time the app calls it, and keeps it. Session tokens are only accepted for that id;
- writes [`config.toml`](./src/config.rs), then builds the bot and runs it on port 3100, printing
  what you need to register it:

```
Name: PressCounterBot
Principal: <the identity's principal>
Endpoint: http://localhost:3100
```

To run it again without the script, from `rs/offchain/examples/press_counter`:

```bash
cargo run --release              # reads ./config.toml, or pass its path
```

### 3. Register and install it

1. In your test group on http://localhost:5001, send `/register_bot`, and fill in the name, principal
   and endpoint the script printed.
2. Open the group's members, choose "Add bots", pick PressCounterBot and install it, granting it the
   MiniApp message permission which `/press` needs.

### 4. Play

1. Send `/press` in the group. The bot posts the card.
2. Tap Open on the card, then Press.
3. Sign in as another user, eg. in a private window or another browser, join the group, and open
   the same card. Each of you sees the other's presses within a couple of seconds.

### If something's wrong

The bot logs to the terminal it runs in, and the app shows the API's errors under the button.

- **"Failed to look up the bot's id. Has it been registered? ... OCError(207, None)"**: the
  UserIndex doesn't know the bot (207 is `BotNotFound`), so register it (step 3).
- **"... Canister has no query method 'bot_installation_events_msgpack'"**: `config.toml`'s
  `user_index_canister_id` isn't the running replica's UserIndex. Point `OPEN_CHAT_DIR` at the
  `open-chat` checkout which deployed it and run the script again.
- **A 401, "Invalid token: ..."**: the public key in `config.toml` isn't the one OpenChat signs with,
  eg. after redeploying OpenChat. Run the script again.
- **"The token is for the bot ..., not this one"**: the card is another bot's, or the bot looked up
  its id from another OpenChat deployment.
- **"Couldn't connect to OpenChat"** in the app: the website didn't answer `mini_app_ready`, eg. it
  doesn't have MiniApp support yet.

Games must never take or pay out tokens, or anything else of value. That's gambling, which OpenChat
isn't licensed for.
