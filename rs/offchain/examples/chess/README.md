# ChessBot

A bot with a [MiniApp](../../../sdk/README.md#miniapp-cards): a game of chess between two members
of a chat, with ten minutes each on the clock, which everyone else in the chat can watch. It goes
through OpenChat's MiniApp service, so OpenChat's card records who's playing, whose move it is and
how the game ended, and spectators never reach the bot.

- The bot's definition lists its one app, `chess`, with its image, [`chess.svg`](./src/chess.svg),
  served next to the app at `GET /app/chess.svg`. The card shows the image in the app's frame
  whenever there's no app to show: before it loads, to anyone who can't open the game, and over a
  finished game with no end state.
- `/chess` posts a card, "**Chess** · 10 minutes each", which names the app, `chess`, for two
  players, open to spectators, with the app's size, 440 by 740, so the card shows the app at that
  aspect ratio before it loads. The bot gets a post token from the LocalUserIndex,
  `mini_app_post_token`, keys the game from it, `MiniAppGame::from_post_token`, and hands it to the
  service with the card, `MiniAppServiceClient::post`. The service posts the card as the bot and
  records the game.
- People join and leave with the card's buttons, which OpenChat draws. The service asks the bot,
  at `POST /mini_app/join`, which takes the first two, and tells it at `/mini_app/leave`.
- Open opens the bot's app, `{endpoint}/app`, in a frame: [one HTML page](./src/app.html), with
  inline JS and no build step, which does the app's side of OpenChat's postMessage protocol. A
  player sees the board from their side, with their clock at the bottom; a spectator sees it from
  White's.
- Either player's Start button sends `mini_app_start`. OpenChat asks the service, which asks the bot
  at `POST /mini_app/start`. The bot tosses a coin for White, starts White's clock, and answers with
  the players, White first, White as the one it's waiting for, and the first state. The card then
  lists the players and whose move it is.
- A player taps a piece, then the square to move it to; the app offers the piece when a pawn
  promotes. The move goes to `POST /api/move` as UCI, eg. `{ "move": "e2e4" }`, with the player's
  token in `x-oc-jwt`. The bot checks it's legal and in turn, stops the mover's clock and starts the
  other's, and publishes the new position, `MiniAppServiceClient::update` with a `GameState` and
  `waiting_for` the side to move. The service passes the state to everyone with the game open and
  writes whose turn it is to the card.
- Resign (`POST /api/resign`) and Offer draw (`POST /api/draw`, which accepts the other player's
  offer if it stands) are the app's own buttons: once a game has started, leaving it is up to the
  bot. The game also ends by itself on checkmate, stalemate, insufficient material, threefold
  repetition and the fifty-move rule.
- **The clock.** Each side has ten minutes for the whole game, with no increment. The bot keeps the
  clocks: each state carries what each side has left and whose clock is running, and the app counts
  down from there. When a side's clock starts, the bot sets a timer for the moment its flag falls;
  if the side hasn't moved by then, the game ends, won by the other side, or drawn if the other side
  hasn't the material to mate with. A move arriving after the flag has fallen is refused.
- The result goes on the card, eg. "White won by checkmate", "Black won on time", "Draw by
  agreement", with an **end state**, `GameUpdate::with_end_state`: the result, who played, the
  moves, and the position before each move and after the last, as FEN. The card keeps showing the
  app, which gets the end state as `mini_app_end_state` and lets anyone step through the game, with
  Previous and Next, the arrow keys, or a tap on a move. A game too long for the service's 16 KB
  keeps only its final position, marked `truncated`.
- Every token the service signs is verified with a `MiniAppVerifier`, with the service's public key,
  fetched once from `GET /public_key`, and the bot's user id, looked up from the UserIndex. The
  games are kept in memory, so they're lost when the bot is restarted.

The rules are [shakmaty](https://crates.io/crates/shakmaty)'s.

| Route | Token | |
| --- | --- | --- |
| `POST /execute_command` | the command's | `/chess` |
| `POST /mini_app/join`, `/mini_app/start`, `/mini_app/leave` | the service's | the service's calls |
| `GET /app` | none | the app's page |
| `GET /app/chess.svg` | none | the app's image, for the card |
| `POST /api/move` | a player's | plays `{ "move": "<uci>" }` |
| `POST /api/resign` | a player's | resigns |
| `POST /api/draw` | a player's | offers, or accepts, a draw |
| `GET` anything else | none | the bot's definition |

The API answers `{ "ok": true }`, or `{ "error" }` with a 401 for a missing, invalid or expired
token, a 409 for something the game doesn't allow, eg. a move out of turn, or a 502 if the service
didn't take the update. The state everyone sees is:

```json
{
  "status": "Open" | "Active" | "Finished",
  "players": ["<user id>", ...],
  "white": "<user id>" | null,
  "black": "<user id>" | null,
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "turn": "white" | "black",
  "moves": ["e4", "e5", "Nf3"],
  "last_move": { "from": "g1", "to": "f3" } | null,
  "check": false,
  "legal_moves": ["b8a6", "b8c6", ...],
  "clock": { "at": 1761800000000, "white_ms": 594000, "black_ms": 600000, "running": "black" | null },
  "draw_offer": "white" | "black" | null,
  "result": "White won by checkmate" | null
}
```

where everything from `fen` on is there once the game has started. Nothing is private: both players
and every spectator see the same. The app shows each user by their id, shortened, as it has no
usernames.

Once the game's over, the card keeps its end state, which the app gets instead of a live state:

```json
{
  "version": 1,
  "result": "Black won by checkmate",
  "white": "<user id>",
  "black": "<user id>",
  "moves": ["f3", "e5", "g4", "Qh4#"],
  "fens": ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "...", "..."],
  "last_move": { "from": "d8", "to": "h4" } | null,
  "truncated": true
}
```

with one more FEN than there are moves, the last being the final position, or, if the game was too
long for the service's 16 KB, only the final position, with `truncated` set; otherwise `truncated`
is left out.

## Running it against a local OpenChat

You need a local OpenChat with MiniApp cards and its MiniApp service running, with the `open-chat`
repo cloned next to this one:

```
open-chat-labs/
   |_open-chat
   |_open-chat-bots
```

### 1. Start OpenChat and the MiniApp service

In `open-chat`, as its README says:

```bash
dfx start --clean --background            # the replica, on 127.0.0.1:8080
./scripts/deploy-local.sh default build   # builds the checkout's own wasms
npm --prefix frontend run dev             # the website, on http://localhost:5001
```

and the MiniApp service, on http://localhost:8095, as its own README says, with its principal set
on the local UserIndex.

Sign up on http://localhost:5001 and create a group to test in.

### 2. Run the bot

In `open-chat-bots`:

```bash
./rs/scripts/deploy_chess_bot.sh
```

which takes, all optional:

```bash
./rs/scripts/deploy_chess_bot.sh [identity, default chess_bot] [port, default 3100] [UserIndex canister id]
```

and the environment variables `OPEN_CHAT_DIR`, the `open-chat` checkout (default `../open-chat`, from
this repo's root, so set it when running from a worktree), `OC_REPLICA_PORT` (default 8080) and
`OC_DEV_PORT` (default 5001), as OpenChat's own scripts take them, and `MINI_APP_SERVICE_URL`
(default `http://localhost:8095`). It:

- creates the dfx identity `chess_bot`, if there isn't one, which the bot signs its calls with, and
  exports it to `bot.pem`;
- reads **OpenChat's public key**, which it checks commands with, from the website, at
  http://localhost:5001/public-key. The website's dev server writes it there from the local
  UserIndex when it starts, so run the script again whenever you redeploy OpenChat;
- finds the local **UserIndex** with `dfx canister id user_index` in `open-chat`. The bot asks it
  for its **own id**, the user id OpenChat gives it when it's registered (not its principal), and
  for a LocalUserIndex it's installed on, when the service first calls it. The service's tokens
  are only accepted for that id;
- writes [`config.toml`](./src/config.rs), then builds the bot and runs it on port 3100, printing
  what you need to register it:

```
Name: ChessBot
Principal: <the identity's principal>
Endpoint: http://localhost:3100
```

To run it again without the script, from `rs/offchain/examples/chess`:

```bash
cargo run --release              # reads ./config.toml, or pass its path
```

### 3. Register and install it

1. In your test group on http://localhost:5001, send `/register_bot`, and fill in the name, principal
   and endpoint the script printed.
2. Open the group's members, choose "Add bots", pick ChessBot and install it, granting it the
   MiniApp message permission which `/chess` needs.

### 4. Play

1. Send `/chess` in the group. The service posts the card for the bot.
2. Join on the card. Sign in as another user, eg. in a private window or another browser, join the
   group, and join the card too. Anyone else can tap Open to watch.
3. Tap Open, then Start. The card lists the players, and the app shows whose move it is, with the
   clock running.
4. Tap a piece, then where it goes. Everyone with the card open sees the move and the clocks.
5. Play on to mate, resign, agree a draw, or let a flag fall. The card shows the result, and the
   game is over.

### If something's wrong

The bot logs to the terminal it runs in, and the app shows the API's errors under the board.

- **"Failed to post the card ..."** in the bot's log: the service refused the post, or couldn't
  reach OpenChat. Its message says which, eg. the bot lacks the MiniApp permission, or
  `config.toml`'s `mini_app_service_url` isn't where the service is running.
- **"Failed to look up the bot. Has it been registered? ... OCError(207, None)"**: the UserIndex
  doesn't know the bot (207 is `BotNotFound`), so register it (step 3).
- **"... Canister has no query method 'bot_installation_events_msgpack'"**: `config.toml`'s
  `user_index_canister_id` isn't the running replica's UserIndex. Point `OPEN_CHAT_DIR` at the
  `open-chat` checkout which deployed it and run the script again.
- **A 401 on a command, "Invalid token: ..."**: the public key in `config.toml` isn't the one
  OpenChat signs with, eg. after redeploying OpenChat. Run the script again.
- **"The token is for the bot ..., not this one"**: the card is another bot's, or the bot looked up
  its id from another OpenChat deployment.
- **"Couldn't connect to OpenChat"** in the app: the website didn't answer `mini_app_ready`.
- **"You're not playing"** after restarting the bot: its games are in memory, so it's forgotten
  who joined. Post a new card.

Games must never take or pay out tokens, or anything else of value. That's gambling, which OpenChat
isn't licensed for.
