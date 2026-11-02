// ChatMan's view: the player's own board on a canvas, with everyone's scores under it. ChatMan
// turns with the arrow keys or WASD, a swipe on the maze, or the arrows under it on a phone, and the
// page plays the board on at once, as it has the rules too (`rules.ts`), sending each turn to the
// bot over the live socket (`live.ts`), or over HTTP while that's reconnecting, with the tick it was
// taken at. Each state has every board as the bot has it, a little behind the clock, with the turns
// it's had but not reached, so the page plays its own board on from there with the turns the bot
// hasn't had yet, and everyone else's with what the bot's had of theirs. A spectator, who has no
// socket, gets the states through OpenChat, and watches the leader, or whoever they pick.
//
// The page keeps its clock in step with the bot's by the `now` in each state: the state that took
// least time to arrive says it best, so it's the most any state says.
import type { LiveResult } from "../../games/game";
import { WIDTH, HEIGHT } from "../../games/chatman/maze";
import { isCaught, isCleared, Mazes, play, TICK_MS, TICKS_PER_SECOND, unpack, type Board, type Turn } from "../../games/chatman/rules";
import { CHATMAN_SETTINGS } from "../../games/chatman/settings";
import {
    DIRECTION_NUMBERS,
    GAME_ID,
    LAG_TICKS,
    MAX_PLAYERS,
    STATE_VERSION,
    type PlayerState,
    type SharedState,
    type TurnMessage,
} from "../../games/chatman/types";
import { isDirection, type Direction } from "../../games/maze/maze";
import { LiveSocket } from "../live";
import { fetchUsernames, usernameOf } from "../names";
import type { GameView, Lobby, ViewContext } from "../view";
import { drawBoard, lifeSvg } from "./draw";

const KEYS: Record<string, Direction> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
};
const WAYS: readonly Direction[] = ["up", "right", "down", "left"];
/** The fewest milliseconds between turns, well inside the socket's limit */
const TURN_EVERY_MS = 40;
/** How far a finger goes on the maze before it's a swipe */
const SWIPE_PX = 18;
/** How often the scores under the board are drawn again */
const STANDINGS_EVERY_MS = 250;

type Dom = {
    root: HTMLElement;
    status: HTMLElement;
    score: HTMLElement;
    level: HTMLElement;
    lives: HTMLElement;
    canvas: HTMLCanvasElement;
    banner: HTMLElement;
    controls: HTMLElement;
    hint: HTMLElement;
    note: HTMLElement;
    standings: HTMLElement;
    /** Each player's line in the standings */
    rows: Map<string, Row>;
};

/** A player's line in the standings, with the lives it shows, or -1 for "Out" */
type Row = {
    li: HTMLElement;
    who: HTMLElement;
    lives: HTMLElement;
    score: HTMLElement;
    shownLives?: number;
};

/** A board played on from the latest state, as far as it's got, and the turns it hasn't reached */
type Reckoning = { sent: number; board: Board; queue: Turn[] };

let ctx: ViewContext | undefined;
let dom: Dom | undefined;
/** The newest state, from the socket or OpenChat, whichever has the higher `rev` */
let latest: SharedState | undefined;
/** How the game ended, once the card has it */
let end: SharedState | undefined;
let endSource: unknown;
let mazes: Mazes | undefined;
/** The bot's clock less the page's */
let offset: number | undefined;
/** The player's turns the bot hasn't had yet, and the number the next one gets */
const sent: Turn[] = [];
let nextN = 1;
let turnedAt = 0;
/** Each board, played on from the latest state, by player */
const reckoned = new Map<string, Reckoning>();
/** Whose board a spectator's chosen to watch */
let watching: string | undefined;
let frame: number | undefined;
let standingsAt = 0;
let focused = document.hasFocus();
/** What's drawn in the bar over the board, so it's only touched when it changes */
let bar = "";

const socket = new LiveSocket<SharedState>(() => ctx, {
    wanted: () => canPlay(),
    state: (shared) => take(shared),
    // The turns made while it was away go again: the bot takes each once
    opened: (send) => {
        for (const turn of sent) send(message(turn));
    },
    error: (text) => ctx?.notice(text),
    changed: () => render(),
});

export const chatmanView: GameView = {
    id: GAME_ID,
    title: "ChatMan",
    stateVersion: STATE_VERSION,

    attach(_root, context) {
        ctx = context;
        window.addEventListener("focus", () => {
            focused = true;
            renderHint();
        });
        window.addEventListener("blur", () => {
            focused = false;
            renderHint();
        });
        window.addEventListener("resize", () => draw());
        document.addEventListener("visibilitychange", () => animate());
        setInterval(() => ctx?.render(), 1000);
    },

    isOpen(state) {
        return (state as SharedState).phase === "open";
    },

    lobby(state): Lobby {
        const s = state as SharedState;
        const { minutes, lives } = s.settings;
        return {
            blurb: `Everyone plays their own ChatMan in the same mazes, at the same time: eat the
                dots and dodge the spam bots, and eat a power pellet to turn the tables for a few
                seconds. The top score after <strong>${minutes} minute${minutes === 1 ? "" : "s"}</strong>
                wins, with <strong>${lives} li${lives === 1 ? "fe" : "ves"}</strong> each.`,
            seats: s.seats,
            hint: `Start when everyone has joined. Up to ${MAX_PLAYERS} can play.`,
            settings: {
                specs: CHATMAN_SETTINGS,
                current: s.settings,
                host: s.host,
                hostName: s.hostName,
            },
        };
    },

    renderLive(body, shared) {
        take(shared as SharedState);
        end = undefined;
        ensureDom(body);
        socket.connect();
        render();
    },

    renderEnd(body, endState) {
        const read = readEnd(endState);
        if (read === undefined) return false;
        if (endState !== endSource) {
            endSource = endState;
            end = read;
            mazes = new Mazes(read.seed!);
            reckoned.clear();
            socket.disconnect();
        }
        ensureDom(body);
        render();
        return true;
    },

    clock() {
        const s = shown();
        if (s?.playsAt === undefined || s.endsAt === undefined || s.phase !== "active") return "";
        const now = botNow();
        return now < s.playsAt ? "Get ready" : `${mmss(s.endsAt - now)} left`;
    },

    onKey(event) {
        const way = KEYS[event.key];
        if (way === undefined || !canPlay()) return false;
        turnTo(way);
        return true;
    },

    onAction(action, el) {
        if (action !== "watch" || el.dataset.id === undefined) return;
        watching = el.dataset.id;
        standingsAt = 0;
        render();
    },
};

/** What's drawn: how the game ended, once the card has it, or the newest state */
function shown(): SharedState | undefined {
    return end ?? latest;
}

function readEnd(state: unknown): SharedState | undefined {
    if (state === null || typeof state !== "object") return undefined;
    const s = state as Partial<SharedState>;
    return s.game === GAME_ID &&
        s.version === STATE_VERSION &&
        typeof s.seed === "number" &&
        Array.isArray(s.players)
        ? (s as SharedState)
        : undefined;
}

/** Takes a state from the socket or OpenChat, if it's newer than the one shown */
function take(state: SharedState) {
    const sample = state.now - Date.now();
    offset = offset === undefined ? sample : Math.max(offset, sample);
    if (latest !== undefined && state.rev < latest.rev) return;
    if (state.seed !== latest?.seed) mazes = state.seed === undefined ? undefined : new Mazes(state.seed);
    latest = state;
    const mine = myPlayer();
    if (mine !== undefined) {
        // The bot's had these turns: either they're in its queue, or on its board, or refused
        while (sent.length > 0 && sent[0].n <= mine.ack) sent.shift();
        nextN = Math.max(nextN, mine.ack + 1);
    }
    reckoned.clear();
    if (state.phase === "finished") socket.disconnect();
}

function myPlayer(): PlayerState | undefined {
    const id = ctx?.oc.userId;
    return latest?.players.find((p) => p.id === id);
}

function canPlay(): boolean {
    return (
        end === undefined &&
        ctx?.oc.role === "player" &&
        ctx.oc.finished !== true &&
        latest?.phase === "active" &&
        myPlayer() !== undefined
    );
}

/** The bot's clock, as near as the page can tell */
function botNow(): number {
    return Date.now() + (offset ?? 0);
}

/** How far into the game it is, in ticks with their fractions: below 0 in the countdown */
function gameTicks(s: SharedState): number {
    if (s.playsAt === undefined) return 0;
    return (botNow() - s.playsAt) / TICK_MS;
}

function lastTick(s: SharedState): number {
    return s.settings.minutes * 60 * TICKS_PER_SECOND;
}

/**
 * A player's board as it is now: the bot's, played on. The player's own is played on to now,
 * with the turns the bot hasn't had yet on top; anyone else's to where the bot will have it.
 */
function boardOf(s: SharedState, id: string): Board | undefined {
    const player = s.players.find((p) => p.id === id);
    if (player === undefined || mazes === undefined) return undefined;
    const mine = id === ctx?.oc.userId && s === latest && canPlay();
    const now = Math.min(lastTick(s), Math.max(0, Math.floor(gameTicks(s))));
    const to =
        s.phase !== "active"
            ? player.board.t
            : mine
              ? Math.max(player.board.t, now)
              : Math.max(player.board.t, now - LAG_TICKS);
    let reckoning = reckoned.get(id);
    if (reckoning === undefined || (mine && reckoning.sent !== sent.length) || reckoning.board.t > to) {
        const board = unpack(player.board, mazes.level(player.board.level));
        const queue: Turn[] = player.queue.map(([n, t, d]) => ({ n, t, d }));
        if (mine) {
            let last = queue.at(-1)?.t ?? board.t;
            for (const turn of sent) {
                if (turn.n <= player.ack) continue;
                last = Math.max(turn.t, last, board.t);
                queue.push({ ...turn, t: last });
            }
        }
        reckoning = { sent: sent.length, board, queue };
        reckoned.set(id, reckoning);
    }
    reckoning.queue = play(reckoning.board, mazes, reckoning.queue, to);
    return reckoning.board;
}

/** Whose board is drawn: the player's own, or for anyone else the one they picked, or the leader's */
function drawnId(s: SharedState): string | undefined {
    const me = ctx?.oc.userId;
    if (s.players.some((p) => p.id === me)) return me;
    if (watching !== undefined && s.players.some((p) => p.id === watching)) return watching;
    return ranked(s)[0]?.id;
}

/** Everyone, top score first, the first to join first of those level */
function ranked(s: SharedState): { id: string; board: Board }[] {
    return s.players
        .map((p, i) => ({ id: p.id, i, board: boardOf(s, p.id)! }))
        .filter((r) => r.board !== undefined)
        .sort((a, b) => b.board.score - a.board.score || a.i - b.i);
}

function message(turn: Turn): TurnMessage {
    return { turn: WAYS[turn.d], n: turn.n, tick: turn.t };
}

function turnTo(way: Direction) {
    const s = latest;
    const me = ctx?.oc.userId;
    if (!canPlay() || s === undefined || me === undefined) return;
    const board = boardOf(s, me);
    if (board === undefined || board.out) return;
    const d = DIRECTION_NUMBERS[way];
    // He's going that way as soon as he can already
    if (board.man.w === d) return;
    const now = Date.now();
    if (now - turnedAt < TURN_EVERY_MS) return;
    turnedAt = now;
    const turn: Turn = { n: nextN++, t: board.t, d };
    sent.push(turn);
    send(turn);
    animate();
}

function send(turn: Turn) {
    if (socket.send(message(turn))) return;
    // No socket just now: the same turn over HTTP, which answers the new state
    void (async () => {
        try {
            const response = await ctx!.oc.fetch("/api/chatman/turn", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(message(turn)),
            });
            const result = (await response.json()) as
                | { ok: true; shared: SharedState }
                | Extract<LiveResult, { ok: false }>;
            if (result.ok) take(result.shared);
            render();
        } catch {
            // The next state has the turn, or the page sends it again when the socket's back
        }
    })();
}

function ensureDom(body: HTMLElement) {
    if (dom !== undefined && body.contains(dom.root)) return;
    body.innerHTML = `
        <div class="chatman">
            <p class="chatman-status"></p>
            <div class="chatman-bar">
                <span class="chatman-score">0</span>
                <span class="chatman-level"></span>
                <span class="chatman-lives"></span>
            </div>
            <div class="chatman-stage">
                <canvas class="chatman-board" aria-label="The maze"></canvas>
                <div class="chatman-banner" hidden></div>
            </div>
            <div class="controls" hidden>
                <div class="dpad">
                    <button data-direction="up" aria-label="Up">↑</button>
                    <button data-direction="left" aria-label="Left">←</button>
                    <button data-direction="down" aria-label="Down">↓</button>
                    <button data-direction="right" aria-label="Right">→</button>
                </div>
                <p class="muted small"><span class="hint"></span> <span class="note"></span></p>
            </div>
            <ol class="chatman-standings"></ol>
        </div>`;
    const root = body.firstElementChild as HTMLElement;
    const q = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
    dom = {
        root,
        status: q(".chatman-status"),
        score: q(".chatman-score"),
        level: q(".chatman-level"),
        lives: q(".chatman-lives"),
        canvas: q(".chatman-board"),
        banner: q(".chatman-banner"),
        controls: q(".controls"),
        hint: q(".hint"),
        note: q(".note"),
        standings: q(".chatman-standings"),
        rows: new Map(),
    };
    bar = "";
    for (const button of root.querySelectorAll<HTMLElement>(".dpad button")) {
        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            const way = button.dataset.direction;
            if (isDirection(way)) turnTo(way);
        });
    }
    // A swipe on the maze turns as soon as the finger's gone far enough, and again if it goes on
    let from: { x: number; y: number } | undefined;
    dom.canvas.addEventListener("pointerdown", (event) => {
        from = { x: event.clientX, y: event.clientY };
    });
    dom.canvas.addEventListener("pointermove", (event) => {
        if (from === undefined) return;
        const dx = event.clientX - from.x;
        const dy = event.clientY - from.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
        turnTo(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
        from = { x: event.clientX, y: event.clientY };
    });
    const lift = () => {
        from = undefined;
    };
    dom.canvas.addEventListener("pointerup", lift);
    dom.canvas.addEventListener("pointercancel", lift);
}

function name(s: SharedState, id: string | undefined): string {
    if (id === undefined) return "Nobody";
    return usernameOf(id) ?? s.names[id] ?? id.slice(0, 5);
}

function render() {
    const s = shown();
    if (dom === undefined || s === undefined || ctx === undefined) return;
    fetchUsernames(
        ctx,
        s.players.map((p) => p.id),
    );
    const playing = canPlay();
    const me = ctx.oc.userId;
    const id = drawnId(s);
    if (s.phase === "finished") {
        dom.status.textContent = resultLine(s);
    } else if (!s.players.some((p) => p.id === me)) {
        dom.status.textContent = `Watching ${name(s, id)}${s.players.length > 1 ? ": pick a name to watch someone else" : ""}`;
    } else {
        dom.status.textContent = "";
    }
    dom.status.hidden = dom.status.textContent === "";
    dom.controls.hidden = !playing;
    dom.note.textContent =
        playing && !socket.live && !socket.unavailable ? "Reconnecting for live updates…" : "";
    renderHint();
    standingsAt = 0;
    draw();
}

function resultLine(s: SharedState): string {
    const winner = s.players.find((p) => p.id === s.winner);
    if (winner === undefined) return "The game is over";
    const points = winner.board.score.toLocaleString("en-US");
    const what = s.players.length > 1 ? `won with ${points} points` : `scored ${points} points`;
    return `${s.ended === "time" ? "Time's up! " : ""}${name(s, winner.id)} ${what}`;
}

function renderHint() {
    if (dom === undefined) return;
    const keyboard = matchMedia("(hover: hover) and (pointer: fine)").matches;
    dom.hint.textContent = !keyboard
        ? "Swipe the maze, or tap an arrow."
        : focused
          ? "Arrow keys or WASD."
          : "Click the maze to use the keys.";
}

function renderStandings(s: SharedState) {
    if (dom === undefined) return;
    const me = ctx?.oc.userId;
    const spectator = !s.players.some((p) => p.id === me);
    const drawn = drawnId(s);
    // A player's line is kept while they're in the standings, and only what's changed in it is
    // touched: they're drawn four times a second, and a click on a name whose line is replaced
    // between the press and the release goes nowhere
    const seen = new Set<string>();
    for (const { id, board } of ranked(s)) {
        let row = dom.rows.get(id);
        if (row === undefined) {
            row = standingsRow();
            dom.rows.set(id, row);
        }
        const li = row.li;
        li.classList.toggle("mine", id === me);
        li.classList.toggle("watched", spectator && id === drawn);
        if (spectator) {
            li.dataset.action = "watch";
            li.dataset.id = id;
        } else {
            delete li.dataset.action;
            delete li.dataset.id;
        }
        const who = name(s, id);
        if (row.who.textContent !== who) row.who.textContent = who;
        const lives = board.out ? -1 : board.lives;
        if (row.shownLives !== lives) {
            row.shownLives = lives;
            row.lives.innerHTML = board.out ? "Out" : lifeSvg(12).repeat(board.lives);
        }
        const score = board.score.toLocaleString("en-US");
        if (row.score.textContent !== score) row.score.textContent = score;
        // Into its place, moving only the lines whose place has changed
        const at = dom.standings.children[seen.size] ?? null;
        if (at !== li) dom.standings.insertBefore(li, at);
        seen.add(id);
    }
    for (const [id, row] of dom.rows) {
        if (!seen.has(id)) {
            row.li.remove();
            dom.rows.delete(id);
        }
    }
}

function standingsRow(): Row {
    const li = document.createElement("li");
    const who = document.createElement("span");
    who.className = "who";
    const lives = document.createElement("span");
    lives.className = "lives";
    const score = document.createElement("span");
    score.className = "score";
    li.append(who, lives, score);
    return { li, who, lives, score };
}

// Draws the board, and while the game's on, again every frame
function draw() {
    const s = shown();
    if (dom === undefined || s === undefined || mazes === undefined || !document.body.contains(dom.root)) {
        return;
    }
    const id = drawnId(s);
    const board = id === undefined ? undefined : boardOf(s, id);
    if (board === undefined) return;
    fitCanvas();
    const ticks = gameTicks(s);
    const fraction = s.phase === "active" && ticks > 0 ? ticks - Math.floor(ticks) : 0;
    drawBoard(dom.canvas, mazes.level(board.level), board, { fraction, time: performance.now() });

    // The bar over the board, when it's changed
    const lives = board.out ? "" : lifeSvg(16).repeat(board.lives);
    const now = `${board.score}|${board.level}|${board.lives}|${board.out}`;
    if (now !== bar) {
        bar = now;
        dom.score.textContent = board.score.toLocaleString("en-US");
        dom.level.textContent = `Level ${board.level}`;
        dom.lives.innerHTML = lives;
    }
    // What's going on, over the board
    let banner = "";
    if (s.phase === "active" && ticks < 0) banner = String(Math.ceil(-ticks / TICKS_PER_SECOND));
    else if (board.out) banner = s.phase === "active" ? "Out of lives" : "";
    else if (isCleared(board)) banner = `Level ${board.level + 1}`;
    else if (isCaught(board) && board.lives > 0) banner = "Caught!";
    dom.banner.hidden = banner === "";
    dom.banner.textContent = banner;

    if (performance.now() - standingsAt > STANDINGS_EVERY_MS) {
        standingsAt = performance.now();
        renderStandings(s);
    }
    animate();
}

function animate() {
    const s = shown();
    if (frame !== undefined || document.visibilityState === "hidden" || s?.phase !== "active" || end !== undefined) {
        return;
    }
    frame = requestAnimationFrame(() => {
        frame = undefined;
        draw();
    });
}

// The maze is as wide as the frame, unless what's around it leaves less height than it needs
function fitCanvas() {
    if (dom === undefined) return;
    let used = 0;
    for (const el of dom.root.children) {
        if (el.classList.contains("chatman-stage")) continue;
        const style = getComputedStyle(el);
        if (style.display === "none") continue;
        used += (el as HTMLElement).offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    }
    const available = document.documentElement.clientHeight - dom.root.getBoundingClientRect().top - 16;
    const width = Math.floor(((available - used) * WIDTH) / HEIGHT);
    dom.canvas.style.maxWidth = `${Math.max(180, width)}px`;
}

function mmss(ms: number): string {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
