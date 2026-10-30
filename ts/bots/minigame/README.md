# MiniGameBot

Games played from MiniApp cards in OpenChat chats. `/play <game>` posts a card; people join from
the card, a player starts the game, and it's played in the card, in the bot's own page. Two games:

- a **2048 race**: up to 10 players, each on their own board, and the first to make a 2048 tile
  wins, or the top score when 10 minutes are up. A player whose board gets stuck restarts on a fresh
  board, as often as they like, and everyone sees how many times;
- **chess**: two players, with ten minutes each on the clock and no increment, which everyone else
  in the chat can watch. A coin decides who's White. The rules are
  [chess.js](https://github.com/jhlywa/chess.js)'s (MIT): the game ends by itself on checkmate,
  stalemate, insufficient material, threefold repetition and the fifty-move rule, and otherwise by
  a flag falling, resignation or an agreed draw.

The bot is a TypeScript Express server, built on the SDK in [`ts/library`](../../library), and the
page is a small browser app built with Vite from the same source tree, so the server and the page
share the games' rules: the page applies a 2048 move as soon as it's made, and the bot's answer
confirms it and adds the new tile.

## How a game runs

Every game goes the same way up to the start, through the `Game` interface in `src/games/game.ts`,
which the store, the handlers, the sweep and the publisher use, and which each game implements.

1. **`/play 2048`** or **`/play chess`** asks the LocalUserIndex for a post token, records the game,
   and has the MiniApp service post the card. The service is the only thing that posts a card or
   writes its status; the protocol is open-chat's `backend/docs/mini_app_service_protocol.md`. The
   empty lobby is published once the card is up, so the page knows which game it's showing. The
   command's other parameters are the game's settings, the race's winning tile and time limit,
   which are the defaults if left out; the game's host, who ran the command, can change them in
   the lobby until the start (`POST /api/settings`), and everyone in the lobby sees them. A game
   declares its settings (`src/games/settings.ts`), which gives it the parameters, the check on a
   change, and the lobby's form.
2. **Joining** goes through OpenChat's buttons on the card. The service asks the bot at
   `POST /mini_app/join`, which looks the user's name up and gives them a seat: up to 10 in a race,
   two at chess ("This game is for two" after that, "The game has started" once it has). Leaving,
   `POST /mini_app/leave`, frees the seat before the start. After it, a race goes on without them;
   a chess game can't, so it ends, the other player winning "by abandonment". The lobby's seats are
   published as the game's state, so the page shows who's joined.
3. **Starting**: a player presses Start in the page, OpenChat asks the bot at
   `POST /mini_app/start`, and the bot answers with the players, the first state and the game's
   settings, which the card keeps from then on and OpenChat hands to the app. A race deals
   everyone seated a board with two tiles, and it's everyone's turn at once. Chess needs two,
   tosses a coin for White, lists the players White first, says it's waiting for White, and White's
   clock runs.
4. **Moves** go from the page straight to the bot, with the player's token in `x-oc-jwt`, which
   checks the game's own player list on every request and publishes the whole game's state through
   the service after each change, coalescing fast moves into one update every 80 ms. The service
   relays it to every player and spectator, and for chess the update says whose turn it is, which
   the card shows.
   - **2048**: `POST /api/2048/move` with `{ "direction": "left" }` answers with the player's board;
     `POST /api/2048/restart` deals a fresh board.
   - **Chess**: `POST /api/chess/move` with `{ "uci": "e2e4" }`, the squares the move is from and
     to, eg. `e1g1` to castle, with the piece to promote to on the end, eg. `e7e8q`;
     `POST /api/chess/resign`; and `POST /api/chess/draw`, which offers the other player a draw, or
     accepts theirs if it stands. An offer lapses when the other player moves. Each answers
     `{ "ok": true, "shared": <the new state> }`, or `{ "ok": false, "error": ".." }` with a 409 for
     something the game doesn't allow, eg. a move out of turn, or after the time has run out.
5. **The clock**. The bot checks every game's clock every second, and before every request, so a
   game ends on time whether or not anyone's still playing, and so does one that was running when
   the bot last stopped. A race ends when its 10 minutes are up, and the top score wins: a player's
   best from any of their boards, as a restart doesn't lose it, ties going to the higher score now,
   then the higher tile, then the fewer restarts. In chess each side has ten minutes for the whole
   game; each state carries what each side has left and whose clock is running, the page counts
   down from the state's `clock.at`, and when the side to move's flag falls the other side wins "on
   time", or it's a draw if they haven't the material to mate with.
6. **The end**. The bot publishes the final state with `status: "finished"` and the result, which
   the card shows: "Alice reached 2048 in 2m 15s", "Time's up after 10m 0s: Alice won with 5,432
   points", "White won by checkmate", "Black won on time", "Draw by agreement", "Draw by
   stalemate" and so on. With it goes the game's **end state**, which OpenChat keeps in the card and
   hands to the page, so anyone opening a finished card sees how it went, read-only, and a page open
   as the game finishes shows the same. The 2048 end state is the final shared state, every board,
   the winner and the times. The chess end state is the result, who played, the moves, and the
   position before each move and after the last, as the placement field of its FEN, the pieces on
   the board, which the page steps through with Previous and Next, the arrow keys, or a tap on a
   move; a game too long for the service's 16 KB keeps only its final position, marked
   `truncated`, and one too long even for that sends no end state, so the card shows the image and
   the result.

The chess state everyone sees is the Rust ChessBot's, with the players' names added:

```json
{
  "version": 1,
  "game": "chess",
  "status": "Open" | "Active" | "Finished",
  "players": ["<user id>", ...],
  "names": { "<user id>": "Alice", ... },
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

where everything from `fen` on is there once the game has started, `legal_moves` are the side to
move's as UCI, empty once the game's over, and nothing is private. Its end state is:

```json
{
  "version": 1,
  "game": "chess",
  "result": "Black won by checkmate",
  "white": "<user id>",
  "black": "<user id>",
  "names": { "<user id>": "Alice", ... },
  "moves": ["f3", "e5", "g4", "Qh4#"],
  "fens": ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR", "...", "..."],
  "last_move": { "from": "d8", "to": "h4" } | null,
  "truncated": true
}
```

where `fens` are the positions' placement fields, one more than there are moves, or only the final
position with `truncated` set; otherwise `truncated` is left out. The 2048 end state is its shared
state, `SharedState` in `src/games/race2048/types.ts`, with `phase: "finished"`. The page reads
every version of an end state it can, as a card keeps its end state for good; only a live state
from a newer bot asks it to reload.

The bot's definition lists each game's app with its image, `app/2048.svg` and `app/chess.svg`,
hand-drawn SVGs served from `src/app/public`, which OpenChat shows in the card's frame whenever
there's no page to show: before it loads, to someone who can't open the game, and over a finished
game with no end state.

Games are kept in memory and written to `DATA_FILE` (`./data/games.json` by default) on every
change, each with its `kind`, so a restart doesn't end them. The file says when it was written,
and a chess game's clock is persisted with the running side's time left, so the time the bot was
down isn't charged to anyone: on loading, the side to move has what it had when the game was saved,
and the game's state is published again with the new deadline. A finished game is dropped after
two hours, and one that never finished after a day, which is when the service ends a game that's
had no update.

## Adding a game

- Add its rules under `src/games/<game>/`, as a class implementing `Game` (`src/games/game.ts`):
  seats, start, whose turn it is, its clock, a shared state carrying a `version` and the `game`'s
  id, its result, its end state, which the publisher sends only within 16 KB (`jsonBytes` measures
  it), so a game which can run long cuts its own down first, and its data for the store.
- Add it to `src/games/registry.ts`, with its `create` and `fromJson`: that's the `/play` choice,
  the card's one-line text and limits, its settings, each a choice among a few values with a
  default, the size the page is laid out for, which gives the frame in the card
  its aspect ratio, and its image, an SVG at that aspect ratio in `src/app/public`, which the
  definition lists with the app. Add the id to `GameKind`. The page is drawn as wide as the card, so
  it has to work at a few hundred pixels, and full screen.
- Add its requests under `src/handlers/api.ts`, through `act`, which verifies the player's token,
  the game's kind and the player's membership, and route them in `src/app.ts`.
- Draw it under `src/app/<game>/` as a `GameView` (`src/app/view.ts`), and list it in `main.ts`,
  which picks the view by the state's `game` and shows the lobby for every game itself.

## Running it locally

With a local OpenChat running, with its MiniApp service (`backend/mini_app_service/run-local.sh`)
and its website pointed at the service:

```bash
cp .env.example .env   # then fill it in
npm install
npm run dev
```

`npm run dev` builds the page into `dist/app` and runs the server with `tsx`, reloading it as the
source changes. Register the bot at `http://localhost:3100` with `/register_bot`, install it in a
group, and run `/play`.

- `npm test` runs the games' tests, the handlers', the store's, the publisher's, and the server's
  for the routes anyone can fetch.
- `npm run check` type-checks the server and the page.
- `npm run build` compiles the server to `dist/server` and the page to `dist/app`, which
  `npm start` serves.

## Config

| Variable | |
|---|---|
| `PORT` | The port to listen on, 3100 if not set. |
| `OC_PUBLIC` | OpenChat's public key, from the UserIndex's `public_key`. |
| `IC_HOST` | The IC: `http://127.0.0.1:8080` locally, `https://icp-api.io` on mainnet. |
| `IDENTITY_PRIVATE` | The bot's identity, a secp256k1 private key in PEM. |
| `STORAGE_INDEX_CANISTER` | OpenChat's StorageIndex canister. |
| `USER_INDEX_CANISTER` | OpenChat's UserIndex, which players' names are looked up from. Optional: mainnet's if not set. |
| `MINI_APP_SERVICE_URL` | OpenChat's MiniApp service. |
| `OC_API_GATEWAY` | A LocalUserIndex to get the bot's service token from. Optional: the bot remembers the last command's. |
| `DATA_FILE` | Where the games are kept, `./data/games.json` if not set. |
| `APP_DIR` | The built page, `./dist/app` if not set. |
| `RACE_TARGET` | The winning tile unless the command or the host sets it, 2048 if not set. Set it low, eg. 16, to test a race end to end. |
| `RACE_SECONDS` | The time limit unless the command or the host sets it, 600 if not set. Set it short to see the time run out. |

## Docker

The image is built from the `ts` directory, as it needs the SDK beside the bot:

```bash
docker build -f bots/minigame/Dockerfile -t minigame-bot .
```

It serves on `PORT`, 3100 by default, and keeps its games in `/data`, so mount a volume there.
