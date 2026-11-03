# MiniGameBot

Games played from MiniApp cards in OpenChat chats. `/play <game>` posts a card; people join from the
card, a player starts the game, and it's played in the card, in the bot's own page. Ten games:

- a **2048 race**: up to 100 players, each on their own board, and the first to make a 2048 tile
  wins, or the top score when 10 minutes are up. A player whose board gets stuck restarts on a fresh
  board, as often as they like, and everyone sees how many times;
- **chess**: two players, which everyone else in the chat can watch, with ten minutes each on the
  clock, nothing added per move, and White chosen at random, unless the host sets otherwise.
  The rules are
  [chess.js](https://github.com/jhlywa/chess.js)'s (MIT): the game ends by itself on checkmate,
  stalemate, insufficient material, threefold repetition and the fifty-move rule, and otherwise by
  a flag falling, resignation or an agreed draw. Each player's row shows the pieces they've taken
  and how far ahead they are, and a finished game can be copied as PGN, for any chess program.
  The pieces are JohnPablok's improved Cburnett set (CC-BY-SA 3.0; see
  [`src/app/chess/pieces`](src/app/chess/pieces));
- **Four in a Row**: two players, which everyone else can watch, taking turns to drop a disc into a
  grid seven wide and six high, with three minutes each on the clock and who goes first chosen at
  random, unless the host sets otherwise. Four in a line, across, up or on a diagonal, wins, and a
  full grid is a draw. Its rules are built from scratch, and it's the first duel (see "Duels");
- **Reversi**: two players, which everyone else can watch, on an eight by eight board, with five
  minutes each on the clock and who plays Black, and goes first, chosen at random, unless the host
  sets otherwise. A disc flips every line of the other player's discs it flanks, a player with no
  move passes, and when neither can move the one with more discs wins. Its rules are built from
  scratch, and it's a duel too;
- **Hex**: two players, which everyone else can watch, on a 9 by 9 board of hexagons, with five
  minutes each on the clock and who goes first chosen at random, unless the host sets otherwise.
  The players take turns putting a stone on an empty cell, the first to move trying to join the
  top and bottom edges with a chain of their stones, the second the left and right, and one of
  them always does: there's no draw. The second player can swap instead of putting down their
  first stone, taking the first player's. Its rules are built from scratch, and it's a duel too;
- a **maze race**: up to 10 players race through the same maze, 15 by 15 unless the host sets
  otherwise, from the top left to the bottom right, and everyone sees everyone else move, live. The
  first out wins, or whoever's closest to the way out when the 3 minutes are up. The mazes are
  carved from a seed, from scratch, and moves go over a WebSocket to the bot (see "Live games");
- **ChatMan**: up to 10 players, each with their own ChatMan, the OpenChat logo, in the same mazes
  with the same spam bots, at the same time. ChatMan eats the dots and dodges the spam bots, and a
  power pellet frightens them for a few seconds, when he can eat them too. A cleared maze leads to
  the next level's. The top score wins when the 3 minutes are up, or when everyone's out of their 3
  lives, unless the host sets otherwise. It's built from scratch, its mazes, spam bots and look its
  own, and it's played live (see "ChatMan");
- a **Minesweeper race**: up to 10 players race to clear the same minefield, 12 by 12 with 22 mines
  unless the host sets otherwise, each on their own board. The field can always be cleared by
  working it out, without a guess, and a mine set off stops its racer for 10 seconds. The first to
  clear the field wins, or whoever's cleared the most when the 3 minutes are up. It's built from
  scratch (see "Minesweeper race");
- a **Word Race**: up to 20 players race to guess the same five-letter word, each with six guesses.
  Each guess's letters are marked: in the word in that place, in the word elsewhere, or not in it.
  The first to guess the word wins, or whoever came closest when the 3 minutes are up, unless the
  host sets otherwise, or when everyone's had all their guesses. Its words are SCOWL's, and the
  rest is built from scratch (see "Word Race");
- a **Crate Race**: up to 20 players race to push the same four crates onto the same four goals,
  each on their own copy of a level, medium unless the host sets it easy or hard. A player can push
  a crate but not pull it, or push two at once, and can undo a move. The first to put every crate
  on a goal wins, or whoever has the most on goals when the 5 minutes are up. Its levels are
  DeepMind's Boxoban levels, and the rest is built from scratch (see "Crate Race").

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
   game starts with its default settings, eg. the race's winning tile and time limit; the game's
   host, who ran the command, can change them in the lobby until the start (`POST /api/settings`),
   and everyone in the lobby sees them. They aren't the command's parameters: they differ by game,
   and OpenChat's form for a command shows every parameter whichever game is chosen. A game
   declares its settings (`src/games/settings.ts`), which gives it the check on a change and the
   lobby's form.
2. **Joining** goes through OpenChat's buttons on the card. The service asks the bot at
   `POST /mini_app/join`, which looks the user's name up and gives them a seat: up to 100 in a race,
   10 in a maze race, at ChatMan or in a Minesweeper race, 20 in a Word Race or a Crate Race, two at
   chess, Four in a Row, Reversi and Hex ("This game is for two" after that, "The game has started"
   once it has).
   Leaving, `POST /mini_app/leave`, frees the seat before the start. After it, a race goes on
   without them; a game of two can't, so it ends, the result being that they "left the game". The
   lobby's seats are published as the game's state, so the page shows who's joined.
3. **Starting**: a player presses Start in the page, OpenChat asks the bot at
   `POST /mini_app/start`, and the bot answers with the players, the first state and the game's
   settings, which the card keeps from then on and OpenChat hands to the app. A race deals
   everyone seated a board with two tiles, and it's everyone's turn at once. Chess needs two,
   picks White at random unless set, lists the players White first, and says it's waiting for
   White, though White's clock doesn't run until White's second move: White has a minute to make
   the first, and Black a minute after that for theirs, or the game's called off.
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
   - **Four in a Row**: `POST /api/four-in-a-row/move` with `{ "move": 3 }`, the column, counting
     from 0 on the left, and `POST /api/four-in-a-row/resign`, each answering as chess's do.
   - **Reversi**: `POST /api/reversi/move` with `{ "move": "d3" }`, the square, its column a to h
     and its row 1 to 8 from the top, and `POST /api/reversi/resign`, answering the same way.
   - **Hex**: `POST /api/hex/move` with `{ "move": "e5" }`, the cell, its column from a and its
     row from 1 at the top, or `{ "move": "swap" }`, and `POST /api/hex/resign`.
   - **Maze race**: each move goes over the live socket,
     `{ "type": "act", "body": { "move": "left", "n": 7 } }`, where `n` counts the racer's moves
     from 1, and the bot sends the new state to every racer at once; `POST /api/maze/move` with the
     same body takes a move while the socket's reconnecting.
   - **ChatMan**: each turn goes over the live socket too,
     `{ "type": "act", "body": { "turn": "left", "n": 7, "tick": 1234 } }`, with the tick it was
     taken at, and `POST /api/chatman/turn` takes one while the socket's reconnecting.
   - **Minesweeper race**: `POST /api/minesweeper/act` with
     `{ "acts": [{ "reveal": 12 }, { "flag": 30, "on": true }, { "chord": 41 }] }`, the cells
     counted from 0 along the top row, answers with the racer's own board,
     `{ "ok": true, "own": { "view": "..0f12..", "rev": 3, "cleared": 40, "hits": 0, "frozenMs": 0 } }`,
     or `{ "ok": false, "error": "..", "own": .. }` with a 409 if one was refused, eg. while they
     wait after setting off a mine. No acts at all asks for the board.
   - **Word Race**: `POST /api/words/guess` with `{ "guess": "crane" }` answers with the racer's
     own guesses, marked,
     `{ "ok": true, "own": { "guesses": ["trace", "crane"], "marks": ["02212", "22222"] } }`, or
     `{ "ok": false, "error": "..", "own": .. }` with a 409 for a guess that isn't in the word list,
     or one they've made already, which doesn't count. No guess at all asks for them.
   - **Crate Race**: `POST /api/crates/path` with `{ "path": "rrdlu" }`, the racer's moves from the
     level's start less those they've undone, answers with their path as the bot has it,
     `{ "ok": true, "own": { "path": "rrdlu" } }`, or `{ "ok": false, "error": "..", "own": .. }`
     with a 409 for a path with a move that can't be made, which the bot doesn't take. No path at
     all asks for it.
5. **The clock**. The bot checks every game's clock every second, and before every request, so a
   game ends on time whether or not anyone's still playing, and so does one that was running when
   the bot last stopped. A race ends when its 10 minutes are up, and the top score wins: a player's
   best from any of their boards, as a restart doesn't lose it, ties going to the higher score now,
   then the higher tile, then the fewer restarts. In chess each side has ten minutes for the whole
   game, which its clock runs down on its turns once it's made its first move. That one's free, but
   has to be made within a minute (`FIRST_MOVE_MS`), or the game's called off, with no winner. Each
   state carries what each side has left, whose clock is running, and the time left for a first
   move while one's awaited; the page counts down from the state's `clock.at`, and when the side to
   move's flag falls the other side wins "on time", or it's a draw if they haven't the material to
   mate with. The duels' clocks are the same, with three or five minutes each unless set, and a
   flag falling always loses. A maze race ends when its 3 minutes are up, and whoever's closest to
   the way out wins. ChatMan's boards play on by themselves, so the bot plays them on every second
   too, and publishes them; a game ends when its 3 minutes are up, or everyone's out of lives, and
   the top score wins, ties going to whoever joined first.
6. **The end**. The bot publishes the final state with `status: "finished"` and the result, which
   the card shows: "@alice reached 2048 in 2m 15s", "Time's up! @alice won with 5,432 points",
   "White won by checkmate", "Black won on time", "Draw by agreement", "Draw by stalemate", "@alice
   won with four in a row", "@bob resigned", "Draw: the grid is full", "@alice won 40 to 24", "Draw,
   32 discs each", "@alice got out in 1m 12s", "Time's up! @alice got closest to the way out",
   "@alice won with 1,240 points", "@alice scored 980 points" for ChatMan played alone, and so
   on. The race's and a duel's results name players with `@UserId(<id>)` mentions, so the card shows
   their usernames as they are now. With it goes the game's **end state**, which OpenChat keeps in
   the card and hands to the page, so anyone opening a finished card sees how it went, read-only,
   and a page open as the game finishes shows the same. The 2048 end state is the final shared
   state, every board, the winner and the times. The chess end state is the result, who played, the
   moves, and the position before each move and after the last, as the placement field of its FEN,
   the pieces on the board, which the page steps through with Previous and Next, the arrow keys, or
   a tap on a move, showing what had been taken by each; a game too long for the service's 16 KB
   keeps only its final position, marked `truncated`, and one too long even for that sends no end
   state, so the card shows the image and the result. PGN, beside Previous and Next, shows the
   game as PGN, with a Copy button, for any chess program: the players' names, the date it started,
   the time control from the card's settings, the moves, and the result. The card's frame isn't
   allowed the clipboard API, so Copy copies the text as a selection, and if even that isn't
   allowed, leaves it selected for the viewer to copy. A duel's end state is its final shared state, whose moves the page replays to step
   through, and a maze race's is too, with the maze's seed, so the page carves the maze again and
   draws the way out. ChatMan's is its final state, every board as it finished.

The chess state everyone sees is the Rust ChessBot's, with the players' names and what each side
has taken added:

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
  "captured": { "white": "pn", "black": "p" },
  "check": false,
  "legal_moves": ["b8a6", "b8c6", ...],
  "clock": {
    "at": 1761800000000,
    "white_ms": 594000,
    "black_ms": 600000,
    "running": "black" | null,
    "first_move_ms": null | 42000
  },
  "draw_offer": "white" | "black" | null,
  "result": "White won by checkmate" | null
}
```

where everything from `fen` on is there once the game has started, `captured` is the pieces each
side has taken, as their letters in the order taken, `legal_moves` are the side to move's as UCI,
empty once the game's over, `first_move_ms` is the time left for the side to move's first move
while it's awaited, when `running` is null, and nothing is private. Its end state is:

```json
{
  "version": 1,
  "game": "chess",
  "result": "Black won by checkmate",
  "winner": "white" | "black" | null,
  "started_at": 1761799990000,
  "white": "<user id>",
  "black": "<user id>",
  "names": { "<user id>": "Alice", ... },
  "moves": ["f3", "e5", "g4", "Qh4#"],
  "fens": ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR", "...", "..."],
  "last_move": { "from": "d8", "to": "h4" } | null,
  "captured": { "white": "", "black": "" },
  "truncated": true
}
```

where `winner` is null for a draw, and left out of a game called off as a first move wasn't made
in time, `fens` are the positions' placement fields, one more than there
are moves, or only the final position with `truncated` set; otherwise `truncated` is left out. The
page works out what had been taken by each position from the positions before it
(`src/games/chess/material.ts`), and uses `captured` for a game whose positions were cut. The 2048 end state is its shared
state, `SharedState` in `src/games/race2048/types.ts`, with `phase: "finished"`. The page reads
every version of an end state it can, as a card keeps its end state for good. A live state it reads
only at its own version. One it can't read can only be from a newer bot, so it asks to reload:
that's a newer version, a game it doesn't know, or anything but an object with a `version` and a
`game`, so a later release can change the encoding as long as the page can tell the difference.
One from an older bot shows the page's spinner until the bot publishes it again as it starts, as
does the page until it has a lobby, a live game or an end view to show.

The bot's definition lists each game's app with its image, `app/2048.svg`, `app/chess.svg`,
`app/four-in-a-row.svg`, `app/reversi.svg`, `app/maze.svg` and `app/chatman.svg`, SVGs served from
`src/app/public`, which OpenChat shows in the card's frame whenever there's no page to show: before
it loads, to someone who can't open the game, and over a finished game with no end state.

Games are kept in memory and written to `DATA_FILE` (`./data/games.json` by default) on every
change, each with its `kind`, so a restart doesn't end them. The file says when it was written, and
a chess game's or a duel's clock is persisted with the running side's time left, so the time the bot
was down isn't charged to anyone: on loading, the side to move has what it had when the game was
saved. As the bot starts it publishes every unfinished game again, so everyone gets the new deadline
and a page from a new release isn't left with a state it can't read. A finished game is dropped
after two hours, and one that never finished after a day, which is when the service ends a game
that's had no update.

## A race of a hundred

A race's state goes to everyone with the game open on every change, so with a hundred racers it's
kept small (`src/games/race2048/types.ts`):

- a board is 16 hex digits, one per cell, each the tile's power of two (`packBoard`): 8 bytes
  written out, which stays readable in a state dump and packs to raw bytes without a new layout;
- a racer's keys are a letter each, and the move count and the names are left out: the page looks
  up the racers' usernames by id, `GET /api/names?ids=<id>,<id>`, which takes no token and gives
  them as they are now, within the hour, and the end state, which the card keeps for good, carries
  the names they joined with, for when the bot can't say;
- the publisher waits longer between states as the field grows (`publishEveryMs`): 80 ms up to ten
  racers, 400 ms over sixty. A player's own board doesn't wait on it: it's predicted on the page and
  confirmed by the bot's answer to the move.

A hundred racers are about 7 KB a state, and the end state with their names about 11 KB, within the
service's 16 KB. The page draws the top twenty boards and lists the rest with their scores.

## Duels

Four in a Row, Reversi and Hex are duels: games for two who take turns, each with a clock for the
whole game. What every duel shares is in `src/games/duel`: the seats, who goes first (the `first`
setting, "Turn order" in the lobby: random, the host, or the host's opponent), the clocks,
resigning, leaving, and the result, naming the players with mentions. A game brings its rules, a
`Position` that the bot and the page both replay from the moves (eg.
`src/games/fourinarow/grid.ts`), as `DuelRules`, and its board, a `DuelBoard` drawn into the duel's
page (`src/app/duel/view.ts`), which can also give a count to show by each player's name and a note
under whose move it is, as Reversi's discs and passes, and moves that aren't on the board, as
buttons beside Resign, as Hex's swap. The rules start the board from the game's settings, as Hex's
size is one, and can add to what the lobby says of the game. Its requests are
`POST /api/<game>/move` and `POST /api/<game>/resign`, routed for each game in `DUELS`. The state
carries the moves rather than the board, so it stays small, and the page shows players by their
usernames, looked up by id (`GET /api/names`), as the card names them:

```json
{
  "version": 1,
  "game": "four-in-a-row",
  "phase": "open" | "active" | "finished",
  "players": ["<user id>", "<user id>"],
  "names": { "<user id>": "Alice", ... },
  "settings": { "first": 0, "minutes": 3 },
  "host": "<user id>",
  "moves": [3, 3, 4],
  "clock": { "at": 1761800000000, "ms": [176000, 178000], "running": 1 | null },
  "ending": { "kind": "board" | "resignation" | "timeout" | "abandonment", "winner": 0 | 1 | null },
  "startedAt": 1761799990000,
  "finishedAt": 1761800090000
}
```

where `players` are in seat order once the game starts, the first to move first, a seat is 0 or 1,
`clock` is there once the game has started, with `firstMoveMs`, the time left for a first move,
added while the side to move has yet to make one, when `running` is null, and `ending` once it's
over, a `null` winner being a draw. A game called off as a first move wasn't made in time ends
`{ "kind": "aborted", "seat": 0 | 1 }`, the seat that didn't move.

## Live games

A state goes from the bot to the MiniApp service, to each player's OpenChat, to their page, and the
bot sends a few a second at most, which is fine for turns and for racing your own board but too slow
for players to see each other move. So a game played live, which implements `Game.receive`, as the
maze race does, also has a WebSocket from each player's page straight to the bot (`src/live.ts`), at
`/live` on the bot's own origin, on the same port. The card's frame runs the page as the bot's own
site, so this needs nothing of OpenChat.

The page's first message is its player token, `{ "type": "hello", "token": ".." }`, checked as a
request's is, and the bot answers with the state, `{ "type": "state", "shared": {..} }`, then sends
it again on every change, from wherever the change came: a move over the socket or HTTP, a join, the
start, or the clock running out, as the publisher tells the socket of each. A move is
`{ "type": "act", "body": {..} }`, which the game's `receive` takes; one it refuses is answered
`{ "type": "error", "error": ".." }`. A token outlives a removal from the game by up to an hour, so
every message is checked against the game's own list of who's in it.

The bot pings each socket every 15 seconds, dropping one that didn't answer, and sends
`{ "type": "beat" }`, by which the page knows its socket's still there. A socket has 10 seconds to
say hello, may send 20 messages a second on average, 40 at once, of 4 KB at most, and is closed with
a reason otherwise: 4000 for what isn't a message, or anything before the hello; 4001 for no hello,
or a token that isn't the bot's; 4002 for an expired token, when the page gets a fresh one from
OpenChat and comes back; 4003 for someone not in the game; 4004 for a game that's over or isn't
live; and 4008 for too many messages. The page reconnects after anything else, waiting longer each
time, and sends again the moves the bot hadn't taken: each move is numbered, so the bot takes each
once.

Spectators have no token, so they've no socket: they get the states through the service, at most
every 250 ms, which the page draws sliding from cell to cell. The bot publishes a live game through
the service as it does any other, for spectators, latecomers and the card.

The socket sends each change at once, unless the game asks it to wait (`Game.liveEveryMs`) and
coalesce what comes meanwhile, as ChatMan does, whose pages play the boards on between states. On
the page, `src/app/live.ts` keeps the socket: it says hello, reconnects, refreshes an expired token,
and tells the view when it's back, for the moves to go again.

The bot runs as one long-lived process, so the sockets live alongside the games in memory.
Whatever's in front of it has to pass WebSocket upgrades through: CloudFront does, if its
distribution forwards the handshake's headers to the origin.

## ChatMan

Everyone has their own board, in the same mazes with the same spam bots, and the rules
(`src/games/chatman/rules.ts`) play a board a tick at a time, 20 ticks a second, from its turns
alone, in whole numbers, so the bot and the page play it the same way. The spam bots' wandering comes
from a seeded source the board carries.

- **The page plays first.** A turn takes effect on the page at once, and goes to the bot with the
  tick it was taken at. The bot plays every board itself, 10 ticks behind the game's clock
  (`LAG_TICKS`, half a second), taking each turn at its tick, so it doesn't take a page's word for a
  score. A turn that arrives later than that is taken at the tick the bot's got to, and one more
  than 2 seconds ahead of the bot's clock is refused; the bot holds 32 at most that it hasn't
  reached.
- **The state has every board** as the bot has it, packed (`pack`: its numbers, the dots left as a
  bit each, the actors as arrays), about 300 bytes each, with the turns the bot has had but not
  reached, and the bot's clock as it sent it. The page sets its clock by that: as a state can only
  arrive late, the most any state says is the best guess. It plays its own board on from the
  bot's with its own turns the bot hasn't had, so a late turn puts ChatMan where the bot has him,
  and everyone else's with what the bot's had of theirs, as far as the bot will have them.
- **The mazes** (`src/games/chatman/maze.ts`) come from the game's seed and the level: the left half
  carved as the maze race's mazes are, its dead ends opened into loops and a few more walls taken
  out, then mirrored, with the spam bots' pen in the middle and ChatMan's start below it. A test
  pins a seed's maze, so the page and the bot agree in any engine.
- **The spam bots** leave the pen three seconds apart, then make for their corners for 5 seconds and
  chase for 20, three times, then only chase: one at ChatMan, one at the tiles ahead of him, one
  wandering, and one at him from afar, which makes for its corner once it's close. A power pellet
  frightens them for 8 seconds, a second less each level and 3 at least, when they slow down and
  wander, and each eaten is worth double the last, from 100 to 800. From the third level they're
  quicker.
- **The page** draws the player's board, and a spectator's choice of anyone's, the leader's unless
  they pick, every frame, each actor part of the way to its next tile, with everyone's scores and
  lives under it. ChatMan is the OpenChat logo, its purple segment his lips.

The game plays on without anyone moving, so it implements `Game.tick`, which the bot calls every
second, publishing the game when its boards have moved, and `Game.liveEveryMs`, so the socket sends a
state 10 times a second at most however many turns come in.

## Minesweeper race

Everyone races on the same field, so it's skill that wins rather than a lucky board, and while the
race is on only the bot knows where the mines are, and only each racer sees their own board.

- **The field** (`src/games/minesweeper/field.ts`) is laid at the start with its mines clear of a
  starting cell and its neighbours, which every racer has open from the first, and kept only if a
  solver can clear it from there without a guess, or laid again. The solver works as a player
  does: a number with all its mines found has the rest of its neighbours safe, one with as many
  hidden neighbours as mines left has them all mines, two numbers whose neighbours overlap can
  settle the cells only one of them touches, and with every mine found the rest is safe. Laying one
  takes a millisecond or so, even 16 by 16. The store keeps the mines, not the seed.
- **The shared state says only how far each racer's got**: the safe cells they've opened, the mines
  they've set off, and their board's `rev`. Anything more, even which cells they've opened, would
  show everyone else where it's safe. Each racer's board comes in the answer to their own requests
  (`own`), and in their private part of each state, which the service gives only to them
  (`Game.privateState`, which the publisher sends for a game that has one), so it's there as the
  page opens. The page asks the bot for it only when the state says the bot has a newer one than
  the page, eg. if the service hasn't sent it. Once the race is over, the state has every board and
  the mines.
- **A click goes to the bot**, as the page doesn't know what's under a cell. Clicks made while the
  bot's answering go together in the next request, up to 32, so requests go one at a time and in
  order. A flag shows at once, and a cell being opened looks pressed until the answer comes.
- **A mine** shows on the racer's board, counts against them, and stops them for 10 seconds
  (`PENALTY_MS`), when the bot refuses anything they send. When the time's up, the most cleared
  wins, then the fewest mines set off, then whoever got there first.
- **The page** draws the racer's own board, a cell an element, with the mines left to flag and how
  far everyone's got under it. A tap opens a cell, a long press flags it, and a tap on a number with
  its flags all placed opens round it; the flag button swaps a tap and a long press, and on a
  computer a right click flags, as a long press is only for a finger or a pen. Someone watching
  sees how far everyone's got, and once it's over a click on a name shows their board, with the
  mines nobody found and the flags in the wrong place.

## Word Race

Everyone guesses the same word, so while the race is on only the bot knows it, and only each racer
sees their own guesses.

- **The words** (`src/games/words/words.ts`) are SCOWL's (http://wordlist.aspell.net/), as the
  wordlist-english package has its lists, with SCOWL's notice in the file and the rest of it in
  `scowl-copyright.txt` beside it. A race's word is one of about 1900 answers: SCOWL's common
  five-letter words, its levels 10 to 35 in no one dialect, less plurals and other inflections of
  a common word, slang, odd comparatives and words likely to offend. A guess may be any of its 6500
  five-letter words, levels 10 to 70 in any dialect, so a plural or an odd word is a fine guess.
- **A guess is marked** (`src/games/words/marks.ts`) a digit a letter: `2` in the word in that
  place, `1` in the word elsewhere, `0` not in it. A letter the guess has more often than the word
  is marked in the word only as often as the word has it, its places first, then from the left. A
  guess that isn't in the list, or that the racer's made already, is refused, and doesn't count.
- **The shared state says only how each racer's guesses were marked**, as their letters would give
  the word away. Each racer's guesses come in the answer to their own requests (`own`), and in their
  private part of each state, as a Minesweeper racer's board does, so they're there as the page
  opens, and the page asks for them only when the state says the bot has more. Once the race is
  over, the state has everyone's guesses and the word.
- **The first to guess the word wins**, and the race ends there. When the time's up, or everyone's
  had all six guesses, whoever came closest wins: their closest guess had the most letters in
  place, then the most in the word elsewhere, and they made it first.
- **The page** draws the racer's guesses, a row each, with the one they're typing, and a keyboard
  under them whose keys are marked as their guesses have them; they can type with their own too. A
  letter in place is filled, one elsewhere is ringed, with a dot, and one not in the word faded.
  Under them, everyone's marks, as small cards. Someone watching sees just those, bigger, and once
  it's over a click on a name shows their guesses.

## Crate Race

Everyone pushes the same crates on the same level, so while the race is on only the bot and each
racer know where that racer's crates are: they'd show the others how to do it.

- **The levels** (`src/games/crates/levels.ts`) are DeepMind's Boxoban levels
  (https://github.com/google-deepmind/boxoban-levels), under the Apache License 2.0, whose text is
  in `boxoban-license.txt` beside them. Each is 10 by 10 with four crates and four goals. These are
  the first 500 of three of its files: the easy ones from its unfiltered test set, the medium ones
  from its medium validation set, and the hard ones from its hard set. Each was checked to be
  solvable, by a search that found the fewest pushes it takes, which the race says once it's over.
  They're written as their insides, the 8 by 8 within their ring of walls.
- **A racer's moves are their path** (`src/games/crates/board.ts`), a letter a move, from the
  level's start, which the page plays as they make it and the bot plays too: Undo takes the last
  move off, and Restart starts an empty one, which Undo takes back. The page sends the path whole,
  a request at a time, the moves made while one's answered going in the next, so it never has to
  say which moves the bot's seen. A walk changes nothing the others see, so only a push is
  published.
- **The shared state says only how far each racer's got**: their crates on goals and their pushes.
  Each racer's path comes in the answer to their own requests (`own`), and in their private part of
  each state, as a Minesweeper racer's board does; the page asks the bot for it as it opens too, as
  a walk isn't published. Once the race is over, the state has where everyone's crates ended up,
  and the winner's path, which the page can play through.
- **The first to put every crate on a goal wins.** When the time's up, whoever has the most on
  goals wins, then whoever's had that many longest, then whoever pushed the fewest times.
- **The page** draws the level as cells, with the crates and the player over them, sliding from
  cell to cell. The arrow keys or WASD move, as do a swipe and the arrows under the level on a
  phone, a tap on a cell beside the player moves there, and a tap on one further off walks them
  round to it, pushing nothing. Someone watching sees the level as everyone started it, and how
  far everyone's got.

## Adding a game

- Add its rules under `src/games/<game>/`, as a class implementing `Game` (`src/games/game.ts`):
  seats, start, whose turn it is, its clock, a shared state carrying a `version` and the `game`'s
  id, its result, its end state, which the publisher sends only within 16 KB (`jsonBytes` measures
  it), so a game which can run long cuts its own down first, and its data for the store. A game with
  anything only each player may see gives it as `privateState`, by user id.
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
- A game of two taking turns is quicker as a duel (see "Duels"): its `DuelRules`, a registry entry
  made with `Duel` and listed in `DUELS`, which routes its requests, and a `DuelBoard` for the page.
- A game whose players need each other's moves at once implements `receive`, and its page opens the
  live socket with `src/app/live.ts` (see "Live games" and `src/app/maze/view.ts`).
- A game that plays on by itself, with no one moving, implements `tick`, and may pace its live
  states with `liveEveryMs`, as ChatMan does.

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
| `RACE_TARGET` | The winning tile unless the host sets it, 2048 if not set. Set it low, eg. 16, to test a race end to end. |
| `RACE_SECONDS` | The time limit unless the host sets it, 600 if not set. Set it short to see the time run out. |

## Docker

The image is built from the `ts` directory, as it needs the SDK beside the bot:

```bash
docker build -f bots/minigame/Dockerfile -t minigame-bot .
```

It serves on `PORT`, 3100 by default, and keeps its games in `/data`, so mount a volume there.

## Deploying

The bot runs on mainnet as the container `oc-minigame-bot`, on the EC2 instance
`i-0198f9d466e519454` in us-east-1, which it shares with the Discord and Twitch bridges, the price
service and OpenChat's MiniApp service. It holds the maze race's live sockets and keeps its games in
memory as well as in its data file, so it runs on a host that stays up rather than on Lambda, and as
one instance.

**Deploys** are done by the *Deploy MiniGameBot* GitHub Actions workflow
([`deploy-minigame-bot.yaml`](../../../.github/workflows/deploy-minigame-bot.yaml)), run by hand
from `main`:

- It builds the image with [`Dockerfile`](Dockerfile), on an arm runner, pushes it to ECR's
  `oc-minigame-bot` tagged `latest` and with the commit, and through SSM installs the host's systemd
  unit and start script from [`aws/`](aws) as they are in that commit, then restarts the bot. The
  config in Parameter Store stays as it is, and so do the games, in `/var/lib/oc-minigame-bot` on
  the host.

- If the bot doesn't start, or doesn't stay up for 30 seconds, the deploy fails, and systemd keeps
  restarting it.

- It then checks the bot serves its definition at its `PUBLIC_URL`.

- A restart drops the maze race's sockets, which the pages reopen, and the games carry on from the
  data file, their clocks not charging anyone for the time the bot was down.

- On a PR that changes the bot, the SDK, or the workflow, it only builds the image.

### Setting it up

Once, by hand, before the first deploy:

1. **ECR:** a repository `oc-minigame-bot`.

2. **Config,** in SSM Parameter Store, under `/oc-minigame-bot/`: `IDENTITY_PRIVATE` (SecureString),
   the bot's identity, eg. `openssl ecparam -name secp256k1 -genkey -noout`; `OC_PUBLIC`, OpenChat's
   public key, from the UserIndex's `public_key`; `MINI_APP_SERVICE_URL`, the MiniApp service's; and
   `PUBLIC_URL`, the CloudFront distribution's url (step 5), which the deploy checks. The IC and the
   StorageIndex are mainnet's, in the start script.

3. **The host:** nothing to copy, as each deploy installs
   [`aws/oc-minigame-bot-start`](aws/oc-minigame-bot-start) and
   [`aws/oc-minigame-bot.service`](aws/oc-minigame-bot.service) and enables the unit. The script
   runs the container with the bot's port on the host's 8084, as 8080 to 8083 are taken. The
   instance's role, `oc-discord-bridge`, also needs
   [`aws/instance-role-policy.json`](aws/instance-role-policy.json), as a policy of its own beside
   the others: reading `/oc-minigame-bot/*`, pulling from the ECR repository, and writing to the log
   group `/oc/minigame-bot`, which is made beforehand. Its security group admits 8084 only from
   CloudFront: widen its CloudFront rule, `sgr-00f8bcacba0e7ed49`, to 8080 to 8084, as a second rule
   with CloudFront's prefix list is over the group's limit.

4. **The deploy role,** `GitHubActions-DeployMiniGameBot`, which GitHub can assume only from `main`:
   trusting the OIDC provider `token.actions.githubusercontent.com`, with `aud` `sts.amazonaws.com`
   and `sub` `repo:open-chat-labs/open-chat-bots:ref:refs/heads/main`, and allowed, as the Twitch
   bridge's is, to push to the `oc-minigame-bot` ECR repository, `ecr:GetAuthorizationToken`,
   `ssm:SendCommand` on the instance with the `AWS-RunShellScript` document,
   `ssm:GetCommandInvocation`, and `ssm:GetParameter` on `/oc-minigame-bot/PUBLIC_URL`.

5. **Public URL:** a CloudFront distribution of its own in front of the host's 8084, set up as the
   Twitch bridge's is: HTTP to the origin, HTTPS only to viewers, every method, caching disabled,
   and all the viewer's headers but `Host` forwarded, which carries the maze race's WebSocket
   upgrade of `/live` through. OpenChat reads a bot's definition from its endpoint's root, so it
   can't share a distribution.

6. **Register the bot** with `/register_bot`, its endpoint being the `PUBLIC_URL`, its principal
   the identity's and its avatar [`avatar.png`](avatar.png), a 512-pixel render of
   [`avatar.svg`](avatar.svg), whose gamepad sits on the middle row as OpenChat shows the avatar in
   a circle. Then install it where it'll be played, granting it the MiniApp message permission.
   After a deploy that changes the definition, eg. a new game, which is a new app, run
   `/update_bot`, as OpenChat refuses a card whose app isn't in the definition it holds.
