# MiniGameBot

Games played from MiniApp cards in OpenChat chats. `/play <game>` posts a card; people join from
the card, a player starts the game, and it's played in the card, in the bot's own page. The first
game is a **2048 race**: up to 10 players, each on their own board, and the first to make a 2048
tile wins, or the top score when 10 minutes are up. A player whose board gets stuck restarts on a
fresh board, as often as they like, and everyone sees how many times.

The bot is a TypeScript Express server, built on the SDK in [`ts/library`](../../library), and the
page is a small browser app built with Vite from the same source tree, so the server and the page
share the 2048 engine: the page applies a move as soon as it's made, and the bot's answer confirms
it and adds the new tile.

## How a game runs

1. **`/play 2048`** asks the LocalUserIndex for a post token, records the game, and has the MiniApp
   service post the card. The command's other parameters are the game's settings, the winning
   tile and the time limit, which are the defaults if left out; the game's host, who ran the
   command, can change them in the lobby until the race starts (`POST /api/2048/settings`), and
   everyone in the lobby sees them. A game declares its settings (`src/games/settings.ts`), which
   gives it the parameters, the check on a change, and the lobby's form. The service is the only thing that posts a card or writes its status;
   the protocol is open-chat's `backend/docs/mini_app_service_protocol.md`.
2. **Joining** goes through OpenChat's buttons on the card. The service asks the bot at
   `POST /mini_app/join`, which looks the user's name up and gives them a seat, up to 10. Leaving,
   `POST /mini_app/leave`, frees it. The lobby's seats are published as the game's state, so the
   page shows who's joined.
3. **Starting**: a player presses Start in the page, OpenChat asks the bot at
   `POST /mini_app/start`, and the bot deals everyone seated a board with two tiles and answers
   with the first state.
4. **Moves** go from the page straight to the bot, `POST /api/2048/move` with the player's token
   in `x-oc-jwt`, which answers with the player's board. `POST /api/2048/restart` deals a fresh
   board. The bot publishes the whole race's state through the service after each change,
   coalescing fast moves into one update every 80 ms, and the service relays it to every player and
   spectator.
5. **Winning**: the first move that makes a 2048 tile ends the race, and so does the clock: the
   bot checks every second, and before every move, whether a race's 10 minutes are up, and then
   the top score wins: a player's best from any of their boards, as a restart doesn't lose it, ties
   going to the higher score now, then the higher tile, then the fewer restarts. The cards show both,
   as "Top" and "Now". The bot
   publishes the final state with `status: "finished"` and the result, eg. "Alice reached 2048 in
   2m 15s" or "Time's up after 10m 0s: Alice won with 5,432 points", which the card shows.

Games are kept in memory and written to `DATA_FILE` (`./data/games.json` by default) on every
change, so a restart doesn't end them. A finished game is dropped after two hours, and one that
never finished after a day, which is when the service ends a game that's had no update.

## Adding a game

- Add its rules under `src/games/<game>/`, with a shared state type carrying a `version` and a
  `game` id.
- Add it to `src/games/registry.ts`: that's the `/play` choice, the card's one-line text (its
  rules go in the lobby, as the card's text shows where the app doesn't) and limits, its
  settings, and the size the page is laid out for, which gives the frame in the card its aspect ratio. The page
  is drawn as wide as the card, so it has to work at a few hundred pixels, and full screen.
- Add its requests under `src/handlers/`, and route them in `src/app.ts`.
- Draw it in `src/app/` by the state's `game`.

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

- `npm test` runs the engine's and the race's tests.
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
