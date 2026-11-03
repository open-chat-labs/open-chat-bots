// The Crate Race's view: the level, with the racer's own crates and where they are, how many crates
// they have on goals and how many times they've pushed, and how far everyone's got under it. A
// racer moves with the arrow keys or WASD, a swipe on the level, or the arrows under it, and a tap
// on a cell beside them moves there, or on one further off walks them round to it, pushing nothing.
// Undo takes the last move back, as do Z and Backspace, and Restart, or R, starts again, which Undo
// takes back too. The page plays every move at once, as it knows the level, and sends the bot the
// racer's path whole, its moves from the start less those undone: the bot plays it too, and
// answers with the path it has, which the page goes back to if the bot couldn't play one. The path
// also comes in the racer's private part of each state, so it's there as the page opens. Someone
// watching sees the level as everyone started it, and how far everyone's got: their crates would
// show how to do it.
//
// Once the race is over, the card's end state is its final state: where everyone's crates ended
// up, which a click on a name shows, and the winner's moves, which the page can play through.
import {
    MOVES,
    next,
    play,
    readLevel,
    SIDE,
    type Board,
    type Level,
    type Move,
} from "../../games/crates/board";
import { describeResult } from "../../games/crates/result";
import { CRATES_SETTINGS } from "../../games/crates/settings";
import {
    GAME_ID,
    MAX_PATH,
    MAX_PLAYERS,
    STATE_VERSION,
    type PathResponse,
    type RacerState,
    type SharedState,
} from "../../games/crates/types";
import { fetchUsernames, usernameOf } from "../names";
import type { GameView, Lobby, ViewContext } from "../view";

/** How long the page waits to ask for the racer's path again after asking failed */
const RETRY_MS = 3000;
/** How often a held arrow moves again */
const HOLD_EVERY_MS = 160;
/** How often the winner's moves play, when the page shows how they did it */
const WATCH_EVERY_MS = 140;

const KEYS: Readonly<Record<string, Move>> = {
    ArrowUp: "u",
    ArrowDown: "d",
    ArrowLeft: "l",
    ArrowRight: "r",
    w: "u",
    s: "d",
    a: "l",
    d: "r",
};

/** The arrows under the level, named as the maze race's are, which the page's styles lay out */
const ARROWS: Readonly<Record<string, Move>> = { up: "u", down: "d", left: "l", right: "r" };

const LEVEL_NAMES: Readonly<Record<number, string>> = { 1: "an easy", 2: "a medium", 3: "a hard" };

type Row = {
    li: HTMLElement;
    who: HTMLElement;
    crates: HTMLElement;
    pushes: HTMLElement;
    /** How many crates on goals the row was last drawn with */
    placed: number | undefined;
};

type Dom = {
    root: HTMLElement;
    status: HTMLElement;
    bar: HTMLElement;
    count: HTMLElement;
    undo: HTMLButtonElement;
    restart: HTMLButtonElement;
    watch: HTMLButtonElement;
    wrap: HTMLElement;
    board: HTMLElement;
    dpad: HTMLElement;
    hint: HTMLElement;
    standings: HTMLElement;
    /** The level the cells were drawn for */
    drawnLevel: string;
    /** The crates and the player, drawn over the cells */
    crates: HTMLElement[];
    player: HTMLElement;
    /** Each racer's line in the standings, kept so a click on a name isn't lost to a redraw */
    rows: Map<string, Row>;
};

let ctx: ViewContext | undefined;
let dom: Dom | undefined;
/** The newest state from OpenChat */
let latest: SharedState | undefined;
/** How the race ended, once the card has it */
let end: SharedState | undefined;
let endSource: unknown;
/** The racer's moves, once the page has them, and their board, which is the level with them played */
let path: string | undefined;
let board: Board | undefined;
/** The path before the racer last started again, which Undo goes back to */
let restartedFrom: string | undefined;
/** Whether the racer's moved since the page took their path, when the bot's is older than theirs */
let moved = false;
/** The last path the bot took, and whether a request's on its way */
let confirmed: string | undefined;
let sending = false;
let retryAt = 0;
let asked = false;
/** Whose crates are shown once the race is over */
let picked: string | undefined;
/** The winner's moves being played through, how many have been, and the timer while it plays */
let watching: { moves: number; timer?: ReturnType<typeof setInterval> } | undefined;

export const cratesView: GameView = {
    id: GAME_ID,
    title: "Crate Race",
    stateVersion: STATE_VERSION,

    attach(_root, context) {
        ctx = context;
        window.addEventListener("resize", () => fit(true));
        setInterval(() => ctx?.render(), 1000);
    },

    isOpen(state) {
        return (state as SharedState).phase === "open";
    },

    lobby(state): Lobby {
        const s = state as SharedState;
        const { difficulty, minutes } = s.settings;
        return {
            blurb: `Everyone races to push the same four crates onto the same four goals, each on
                their own copy of <strong>${LEVEL_NAMES[difficulty] ?? "a"} level</strong>. You can
                push a crate but not pull it, or push two at once, and you can undo a move. The
                first to put every crate on a goal wins, or whoever has the most on goals when the
                <strong>${minutes} minutes</strong> are up.`,
            seats: s.seats,
            hint: `Start when everyone has joined. Up to ${MAX_PLAYERS} can race.`,
            settings: {
                specs: CRATES_SETTINGS,
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
        render();
    },

    renderEnd(body, endState) {
        const read = readEnd(endState);
        if (read === undefined) return false;
        if (endState !== endSource) {
            endSource = endState;
            end = read;
        }
        ensureDom(body);
        render();
        return true;
    },

    clock() {
        const s = shown();
        if (s?.startedAt === undefined) return "";
        // Rounded once it's over, as the result is, eg. "in 1m 12s"
        if (s.phase === "finished") return mmss((s.finishedAt ?? Date.now()) - s.startedAt, true);
        return s.endsAt === undefined ? "" : `${mmss(s.endsAt - Date.now())} left`;
    },

    onKey(event) {
        if (!canRace() || event.ctrlKey || event.metaKey || event.altKey) return false;
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        const move = KEYS[key];
        if (move !== undefined) moveBy(move);
        else if (key === "z" || key === "Backspace") undo();
        else if (key === "r") restart();
        else return false;
        return true;
    },

    onAction(action, el) {
        if (action === "undo") undo();
        else if (action === "restart") restart();
        else if (action === "watch") watch();
        else if (action === "pick") {
            picked = el.dataset.id;
            stopWatching();
            render();
        }
    },
};

/** What's drawn: how the race ended, once the card has it, or the newest state */
function shown(): SharedState | undefined {
    return end ?? latest;
}

function readEnd(state: unknown): SharedState | undefined {
    if (state === null || typeof state !== "object") return undefined;
    const s = state as Partial<SharedState>;
    return s.game === GAME_ID &&
        s.version === STATE_VERSION &&
        typeof s.level === "string" &&
        readLevel(s.level) !== undefined &&
        Array.isArray(s.racers) &&
        s.racers.every((r) => Array.isArray(r.crates) && typeof r.player === "number")
        ? (s as SharedState)
        : undefined;
}

function levelOf(s: SharedState): Level | undefined {
    return s.level === undefined ? undefined : readLevel(s.level);
}

/**
 * Takes a state from OpenChat, with the racer's path from their private part of it until the page
 * has one, and asks the bot for the path once, as the part may be older than the bot's
 */
function take(state: SharedState) {
    latest = state;
    if (state.phase !== "active" || myRacer() === undefined) return;
    const part = ctx?.oc.state?.private as { path?: unknown } | undefined;
    if (path === undefined && typeof part?.path === "string") setPath(part.path);
    if (!asked && Date.now() >= retryAt) {
        asked = true;
        void request(undefined);
    }
}

function myRacer(): RacerState | undefined {
    const id = ctx?.oc.userId;
    return latest?.racers.find((r) => r.id === id);
}

function canRace(): boolean {
    return (
        end === undefined &&
        ctx?.oc.role === "player" &&
        ctx.oc.finished !== true &&
        latest?.phase === "active" &&
        myRacer() !== undefined &&
        board !== undefined &&
        !board.solved
    );
}

/** Takes a path, playing it on the level from the start */
function setPath(to: string) {
    const level = latest === undefined ? undefined : levelOf(latest);
    if (level === undefined) return;
    path = to;
    board = play(level, to).board;
}

function moveBy(move: Move) {
    if (!canRace() || path === undefined || board === undefined) return;
    if (path.length >= MAX_PATH) {
        ctx?.notice("That's as many moves as there can be: undo some, or start again");
        return;
    }
    if (!board.move(move)) return;
    path += move;
    changed();
}

// A tap on a cell: a move to it if it's beside the player, or a walk round to it if it's clear
function tap(cell: number) {
    if (!canRace() || board === undefined) return;
    const beside = MOVES.find((move) => next(board!.player, move) === cell);
    if (beside !== undefined) {
        moveBy(beside);
        return;
    }
    for (const move of board.walkTo(cell) ?? []) moveBy(move);
}

function undo() {
    if (!canRace() || path === undefined) return;
    if (path === "" && restartedFrom !== undefined) {
        setPath(restartedFrom);
        restartedFrom = undefined;
    } else if (path !== "") {
        setPath(path.slice(0, -1));
    } else {
        return;
    }
    changed();
}

function restart() {
    if (!canRace() || path === undefined || path === "") return;
    restartedFrom = path;
    setPath("");
    changed();
}

function changed() {
    moved = true;
    render();
    void request(path);
}

/**
 * Sends the bot the racer's path, unless it has it already, or with none, asks for the one it has.
 * One request goes at a time: moves made while one's answered go in the next.
 */
async function request(send: string | undefined) {
    if (ctx === undefined || sending) return;
    if (send !== undefined && send === confirmed) return;
    sending = true;
    try {
        const response = await ctx.oc.fetch("/api/crates/path", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(send === undefined ? {} : { path: send }),
        });
        const result = (await response.json()) as PathResponse;
        if (result.own !== undefined) {
            confirmed = result.own.path;
            // The bot's path, if the racer's hasn't moved on from it, or it refused theirs
            if (!moved || !result.ok) {
                setPath(result.own.path);
                moved = false;
            }
        } else {
            retryAt = Date.now() + RETRY_MS;
            asked = false;
        }
        if (!result.ok) ctx.notice(result.error);
    } catch {
        ctx.notice("Couldn't reach the game");
        retryAt = Date.now() + RETRY_MS;
        if (send === undefined) asked = false;
    }
    sending = false;
    render();
    // Moves made meanwhile, the last of them maybe putting the last crate on its goal
    const live = end === undefined && latest?.phase === "active";
    if (path !== undefined && path !== confirmed && live) void request(path);
}

/**
 * Plays the winner's moves through from the start, or stops them playing. Played through, they
 * stay at the last move until something else is shown.
 */
function watch() {
    if (watching?.timer !== undefined) {
        stopWatching();
        render();
        return;
    }
    const s = shown();
    if (s?.path === undefined || s.path === "") return;
    const total = s.path.length;
    const w: NonNullable<typeof watching> = { moves: 0 };
    w.timer = setInterval(() => {
        w.moves++;
        if (w.moves >= total) {
            clearInterval(w.timer);
            w.timer = undefined;
        }
        render();
    }, WATCH_EVERY_MS);
    stopWatching();
    watching = w;
    picked = s.winner;
    render();
}

function stopWatching() {
    clearInterval(watching?.timer);
    watching = undefined;
}

function ensureDom(body: HTMLElement) {
    if (dom !== undefined && body.contains(dom.root)) return;
    body.innerHTML = `
        <div class="cr">
            <p class="cr-status"></p>
            <div class="cr-bar">
                <span class="cr-count"></span>
                <span class="cr-buttons">
                    <button type="button" data-action="watch" hidden></button>
                    <button type="button" data-action="undo">Undo</button>
                    <button type="button" data-action="restart">Restart</button>
                </span>
            </div>
            <div class="cr-wrap">
                <div class="cr-board" role="grid" aria-label="The level"></div>
            </div>
            <div class="dpad cr-dpad">
                <button data-direction="up" aria-label="Up">↑</button>
                <button data-direction="left" aria-label="Left">←</button>
                <button data-direction="down" aria-label="Down">↓</button>
                <button data-direction="right" aria-label="Right">→</button>
            </div>
            <p class="cr-hint muted small"></p>
            <ol class="cr-standings"></ol>
        </div>`;
    const root = body.firstElementChild as HTMLElement;
    const q = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
    dom = {
        root,
        status: q(".cr-status"),
        bar: q(".cr-bar"),
        count: q(".cr-count"),
        undo: q('[data-action="undo"]'),
        restart: q('[data-action="restart"]'),
        watch: q('[data-action="watch"]'),
        wrap: q(".cr-wrap"),
        board: q(".cr-board"),
        dpad: q(".cr-dpad"),
        hint: q(".cr-hint"),
        standings: q(".cr-standings"),
        drawnLevel: "",
        crates: [],
        player: document.createElement("span"),
        rows: new Map(),
    };
    fitted = "";
    listen(dom);
}

// The arrows, held to keep moving, and a swipe or a tap on the level
function listen(d: Dom) {
    let held: ReturnType<typeof setInterval> | undefined;
    const release = () => {
        clearInterval(held);
        held = undefined;
    };
    for (const button of d.dpad.querySelectorAll<HTMLElement>("button")) {
        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            const move = ARROWS[button.dataset.direction ?? ""];
            if (move === undefined) return;
            release();
            moveBy(move);
            held = setInterval(() => moveBy(move), HOLD_EVERY_MS);
        });
    }
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    let press: { x: number; y: number; cell: number | undefined } | undefined;
    d.board.addEventListener("pointerdown", (event) => {
        const el = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
        press = {
            x: event.clientX,
            y: event.clientY,
            cell: el === null ? undefined : Number(el.dataset.cell),
        };
    });
    d.board.addEventListener("pointerup", (event) => {
        if (press === undefined) return;
        const dx = event.clientX - press.x;
        const dy = event.clientY - press.y;
        const { cell } = press;
        press = undefined;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= 20) {
            moveBy(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "r" : "l") : dy > 0 ? "d" : "u");
        } else if (cell !== undefined) {
            tap(cell);
        }
    });
    d.board.addEventListener("pointercancel", () => (press = undefined));
}

function name(s: SharedState, id: string | undefined): string {
    if (id === undefined) return "Nobody";
    return usernameOf(id) ?? s.names[id] ?? id.slice(0, 5);
}

/** Everyone, the furthest on first: the winner, then the most crates on goals, then the fewest pushes */
function ranked(s: SharedState): RacerState[] {
    const won = (r: RacerState) => (r.id === s.winner ? 1 : 0);
    return [...s.racers].sort(
        (a, b) => won(b) - won(a) || b.placed - a.placed || a.pushes - b.pushes,
    );
}

function render() {
    const s = shown();
    if (dom === undefined || s === undefined || ctx === undefined) return;
    if (s.phase !== "open") {
        fetchUsernames(
            ctx,
            s.racers.map((r) => r.id),
        );
    }
    const level = levelOf(s);
    const me = ctx.oc.userId;
    const finished = s.phase === "finished";
    const racing = canRace();
    const mine = s.racers.find((r) => r.id === me);
    const crates = level?.crates.length ?? 4;

    // What's on the level: the racer's own board, or once it's over, where whoever's picked ended
    // up, or the winner's moves as they're played through; for someone watching, the start
    let shownCrates: readonly number[] | undefined;
    let shownPlayer: number | undefined;
    let whose: string | undefined;
    if (finished && level !== undefined) {
        whose =
            s.racers.find((r) => r.id === picked)?.id ?? mine?.id ?? s.winner ?? ranked(s)[0]?.id;
        if (watching !== undefined && s.path !== undefined) {
            const played = play(level, s.path.slice(0, watching.moves)).board;
            whose = s.winner;
            shownCrates = played.crates;
            shownPlayer = played.player;
        } else {
            const racer = s.racers.find((r) => r.id === whose);
            shownCrates = racer?.crates;
            shownPlayer = racer?.player;
        }
    } else if (board !== undefined && mine !== undefined && end === undefined) {
        whose = me;
        shownCrates = board.crates;
        shownPlayer = board.player;
    } else if (level !== undefined) {
        shownCrates = level.crates;
        shownPlayer = level.player;
    }

    if (finished) {
        const winner = s.racers.find((r) => r.id === s.winner);
        dom.status.textContent = describeResult(s, winner && { ...winner, crates }, (id) =>
            name(s, id),
        );
    } else if (racing) {
        dom.status.textContent = "Push every crate onto a goal";
    } else if (mine !== undefined && board?.solved === true) {
        // Until the state says the race is over, as the page knows first
        dom.status.textContent = "Every crate's on a goal!";
    } else if (mine !== undefined && end === undefined && ctx.oc.role === "player") {
        dom.status.textContent = "Getting your crates…";
    } else {
        dom.status.textContent = "Watching: the level as everyone started it";
    }

    const showBoard = level !== undefined && shownCrates !== undefined && shownPlayer !== undefined;
    dom.wrap.hidden = !showBoard;
    if (showBoard) drawBoard(s.level!, level!, shownCrates!, shownPlayer!);

    // The racer's count and buttons, or the winner's moves to play through once it's over
    const own = whose === me && !finished && board !== undefined;
    dom.bar.hidden = !showBoard;
    if (own) {
        dom.count.textContent = `${board!.placed} of ${crates} on goals · ${pushes(board!.pushes)}`;
    } else if (finished && watching !== undefined && s.path !== undefined) {
        dom.count.textContent = `Move ${watching.moves} of ${s.path.length}`;
    } else if (finished) {
        const racer = s.racers.find((r) => r.id === whose);
        dom.count.textContent =
            racer === undefined
                ? ""
                : `${racer.placed} of ${crates} on goals · ${pushes(racer.pushes)}`;
    } else {
        dom.count.textContent = s.par === undefined ? "" : `It can be done in ${pushes(s.par)}`;
    }
    dom.undo.hidden = dom.restart.hidden = !racing;
    dom.undo.disabled = path === "" && restartedFrom === undefined;
    dom.restart.disabled = path === "";
    dom.watch.hidden = !finished || s.path === undefined || s.path === "";
    dom.watch.textContent = watching?.timer !== undefined ? "Stop" : "Watch how";
    dom.dpad.hidden = !racing;

    renderHint(s, racing, finished, whose);
    renderStandings(s, finished, whose, crates);
    fit();
}

function pushes(n: number): string {
    return `${n} push${n === 1 ? "" : "es"}`;
}

/** The cells, drawn once a level, and the crates and the player over them, where they are */
function drawBoard(code: string, level: Level, crates: readonly number[], player: number) {
    if (dom === undefined) return;
    if (dom.drawnLevel !== code) {
        dom.drawnLevel = code;
        const rows = Array.from({ length: SIDE }, (_, y) => {
            const row = document.createElement("div");
            row.className = "cr-row";
            row.setAttribute("role", "row");
            for (let x = 0; x < SIDE; x++) {
                const i = y * SIDE + x;
                const cell = document.createElement("div");
                cell.setAttribute("role", "gridcell");
                cell.dataset.cell = String(i);
                cell.className = level.walls[i]
                    ? "cr-cell cr-wall"
                    : level.goals[i]
                      ? "cr-cell cr-goal"
                      : "cr-cell";
                cell.setAttribute(
                    "aria-label",
                    level.walls[i] ? "Wall" : level.goals[i] ? "Goal" : "Floor",
                );
                row.append(cell);
            }
            return row;
        });
        dom.crates = level.crates.map(() => {
            const crate = document.createElement("span");
            crate.className = "cr-crate";
            crate.setAttribute("aria-hidden", "true");
            return crate;
        });
        dom.player = document.createElement("span");
        dom.player.className = "cr-player";
        dom.player.setAttribute("aria-hidden", "true");
        dom.board.replaceChildren(...rows, ...dom.crates, dom.player);
    }
    const place = (el: HTMLElement, cell: number) => {
        el.style.setProperty("--x", String(cell % SIDE));
        el.style.setProperty("--y", String(Math.floor(cell / SIDE)));
    };
    crates.forEach((cell, i) => {
        const el = dom!.crates[i];
        if (el === undefined) return;
        place(el, cell);
        el.classList.toggle("on", level.goals[cell]);
    });
    place(dom.player, player);
}

function renderHint(s: SharedState, racing: boolean, finished: boolean, whose: string | undefined) {
    if (dom === undefined) return;
    const touch = !matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (finished) {
        const theirs =
            watching !== undefined
                ? `${name(s, s.winner)}'s moves`
                : whose === ctx?.oc.userId
                  ? "Your crates"
                  : `${name(s, whose)}'s crates`;
        const par = s.par === undefined ? "" : ` It can be done in ${pushes(s.par)}.`;
        dom.hint.textContent = `${theirs}.${s.racers.length > 1 ? " Tap a name for theirs." : ""}${par}`;
    } else if (racing) {
        dom.hint.textContent = touch
            ? "Swipe, or tap a cell to walk there. Undo takes back a move."
            : "Arrows or WASD to move, or click a cell to walk there. Z undoes, R starts again.";
    } else {
        dom.hint.textContent = "";
    }
    dom.hint.hidden = dom.hint.textContent === "";
}

function renderStandings(
    s: SharedState,
    finished: boolean,
    whose: string | undefined,
    crates: number,
) {
    if (dom === undefined) return;
    const me = ctx?.oc.userId;
    const seen = new Set<string>();
    for (const r of ranked(s)) {
        let row = dom.rows.get(r.id);
        if (row === undefined) {
            row = standingsRow();
            dom.rows.set(r.id, row);
        }
        const li = row.li;
        li.classList.toggle("mine", r.id === me);
        li.classList.toggle("picked", finished && r.id === whose);
        li.classList.toggle("winner", finished && r.id === s.winner);
        if (finished) {
            li.dataset.action = "pick";
            li.dataset.id = r.id;
        } else {
            delete li.dataset.action;
            delete li.dataset.id;
        }
        const who = name(s, r.id);
        if (row.who.textContent !== who) row.who.textContent = who;
        if (row.placed !== r.placed) {
            row.placed = r.placed;
            row.crates.innerHTML = Array.from(
                { length: crates },
                (_, i) => `<span class="${i < r.placed ? "on" : ""}"></span>`,
            ).join("");
            row.crates.setAttribute("aria-label", `${r.placed} of ${crates} on goals`);
        }
        const text = pushes(r.pushes);
        if (row.pushes.textContent !== text) row.pushes.textContent = text;
        // Into its place, if it isn't there already
        const at = dom.standings.children[seen.size] ?? null;
        if (at !== li) dom.standings.insertBefore(li, at);
        seen.add(r.id);
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
    const crates = document.createElement("span");
    crates.className = "cr-placed";
    crates.setAttribute("role", "img");
    const pushes = document.createElement("span");
    pushes.className = "count";
    li.append(who, crates, pushes);
    return { li, who, crates, pushes, placed: undefined };
}

// The level is square: as wide as the frame, unless what's around it leaves less height than that.
// Measuring lays the page out, so it's done again only when what's round the level has changed, or
// the frame has.
let fitted = "";

function fit(force = false) {
    if (dom === undefined || dom.wrap.hidden || !document.body.contains(dom.root)) return;
    const around = [
        dom.status.textContent,
        dom.bar.hidden,
        dom.dpad.hidden,
        dom.hint.textContent,
        dom.rows.size,
    ].join("|");
    if (!force && around === fitted) return;
    fitted = around;
    let used = 0;
    for (const el of dom.root.children) {
        if (el === dom.wrap) continue;
        const style = getComputedStyle(el);
        if (style.display === "none") continue;
        used +=
            (el as HTMLElement).offsetHeight +
            parseFloat(style.marginTop) +
            parseFloat(style.marginBottom);
    }
    const available =
        document.documentElement.clientHeight - dom.root.getBoundingClientRect().top - 16;
    dom.wrap.style.maxWidth = `${Math.max(200, Math.floor(available - used))}px`;
}

function mmss(ms: number, round = false): string {
    const seconds = Math.max(0, (round ? Math.round : Math.floor)(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
