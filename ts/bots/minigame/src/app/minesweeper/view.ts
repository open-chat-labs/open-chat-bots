// The Minesweeper race's view: the racer's own board, as the bot last answered with it, with how
// many mines are left to flag over it and how far everyone's got under it. A tap or a click opens a
// cell, a long press or a right click flags it, and a tap on a number with as many flags round it
// as it says opens the rest round it; the flag button swaps what a tap and a long press do, for a
// phone. The page doesn't know where the mines are, so a cell opens when the bot answers, which is
// quick, and clicks made while it's answering go together in the next request. A flag shows at
// once. The board also comes in the racer's private part of each state, so it's there as the page
// opens. Someone watching sees how far everyone's got: the boards would show where it's safe.
//
// Once the race is over, the card's end state is its final state: every board, with the mines,
// and a click on a name in the standings shows theirs.
import { neighbours } from "../../games/minesweeper/field";
import { MINESWEEPER_SETTINGS } from "../../games/minesweeper/settings";
import {
    BOOM,
    FLAG,
    GAME_ID,
    HIDDEN,
    MAX_ACTS,
    MAX_PLAYERS,
    PENALTY_MS,
    STATE_VERSION,
    type Act,
    type ActResponse,
    type OwnBoard,
    type RacerState,
    type SharedState,
} from "../../games/minesweeper/types";
import { duration } from "../../games/race2048/race";
import { fetchUsernames, usernameOf } from "../names";
import type { GameView, Lobby, ViewContext } from "../view";

/** How long a press is held to flag a cell, or, in flag mode, to open it */
const LONG_PRESS_MS = 350;
/** How far a press can wander and still be a press, rather than the start of a scroll */
const PRESS_SLOP_PX = 12;
/** How long the page waits to ask for the racer's board again after asking failed */
const RETRY_MS = 3000;

const FLAG_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 2.5v11M3.5 13.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6.2 2.8 13 5.6 6.2 8.4z" fill="#e5484d"/></svg>`;
const MINE_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6v12.8M1.6 8h12.8M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="8" r="4.3" fill="currentColor"/><circle cx="6.5" cy="6.5" r="1.1" fill="#fff"/></svg>`;

type Row = {
    li: HTMLElement;
    who: HTMLElement;
    fill: HTMLElement;
    count: HTMLElement;
    hits: HTMLElement;
};

type Dom = {
    root: HTMLElement;
    status: HTMLElement;
    bar: HTMLElement;
    left: HTMLElement;
    mode: HTMLButtonElement;
    wrap: HTMLElement;
    board: HTMLElement;
    frozen: HTMLElement;
    hint: HTMLElement;
    standings: HTMLElement;
    /** The board's cells, and what each was last drawn as */
    cells: HTMLElement[];
    drawn: string[];
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
/** The racer's own board, as the bot last answered, and when they can open a cell again */
let own: { board: OwnBoard; frozenUntil: number } | undefined;
/** Clicks waiting to go, and the ones the bot's answering */
let queue: Act[] = [];
let sent: Act[] = [];
let sending = false;
/** Whether the page wants the racer's board from the bot, eg. as it opens */
let wantBoard = false;
let retryAt = 0;
/** Whether a tap flags a cell, rather than opening it */
let flagMode = false;
/** Whose board is shown once the race is over */
let picked: string | undefined;
let frozenTimer: ReturnType<typeof setTimeout> | undefined;

export const minesweeperView: GameView = {
    id: GAME_ID,
    title: "Minesweeper Race",
    stateVersion: STATE_VERSION,

    attach(_root, context) {
        ctx = context;
        window.addEventListener("resize", () => fitBoard(true));
        setInterval(() => ctx?.render(), 1000);
    },

    isOpen(state) {
        return (state as SharedState).phase === "open";
    },

    lobby(state): Lobby {
        const s = state as SharedState;
        const { size, minutes } = s.settings;
        return {
            blurb: `Everyone races to clear the same <strong>${size} by ${size}</strong> field of
                <strong>${s.mines} mines</strong>, each on their own board, and it can always be
                cleared by working it out, without a guess. A mine you set off stops you for
                ${PENALTY_MS / 1000} seconds. The first to clear the field wins, or whoever's
                cleared the most when the <strong>${minutes} minutes</strong> are up.`,
            seats: s.seats,
            hint: `Start when everyone has joined. Up to ${MAX_PLAYERS} can race.`,
            settings: {
                specs: MINESWEEPER_SETTINGS,
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
        // Rounded once it's over, as the result is, eg. "cleared the field in 56s"
        if (s.phase === "finished") return mmss((s.finishedAt ?? Date.now()) - s.startedAt, true);
        return s.endsAt === undefined ? "" : `${mmss(s.endsAt - Date.now())} left`;
    },

    onKey() {
        return false;
    },

    onAction(action, el) {
        if (action === "mode") {
            flagMode = !flagMode;
        } else if (action === "pick") {
            picked = el.dataset.id;
        }
        render();
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
        typeof s.size === "number" &&
        Array.isArray(s.mineCells) &&
        Array.isArray(s.racers) &&
        s.racers.every((r) => typeof r.view === "string")
        ? (s as SharedState)
        : undefined;
}

/**
 * Takes a state from OpenChat, with the racer's board from their private part of it, and asks the
 * bot for the board if the page's is still behind, eg. as the service hasn't sent one
 */
function take(state: SharedState) {
    latest = state;
    const part = ctx?.oc.state?.private;
    // Only a newer one: its wait after a mine was worked out when it was sent
    if (isOwnBoard(part) && (own === undefined || part.rev > own.board.rev)) takeOwn(part);
    if (state.phase === "active" && behind() && Date.now() >= retryAt) {
        wantBoard = true;
        void flush();
    }
}

function isOwnBoard(value: unknown): value is OwnBoard {
    const b = value as Partial<OwnBoard> | null | undefined;
    return (
        typeof b?.view === "string" && typeof b.rev === "number" && typeof b.frozenMs === "number"
    );
}

/** Whether the racer's board on the page is older than the one the state says the bot has */
function behind(): boolean {
    const mine = myRacer();
    return mine !== undefined && (own === undefined || mine.rev > own.board.rev);
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
        myRacer() !== undefined
    );
}

function frozenMs(): number {
    return own === undefined ? 0 : Math.max(0, own.frozenUntil - Date.now());
}

function takeOwn(board: OwnBoard) {
    if (own !== undefined && board.rev < own.board.rev) return;
    own = { board, frozenUntil: Date.now() + board.frozenMs };
}

/** Sends the clicks waiting, or asks for the board, unless the bot's answering already */
async function flush() {
    if (ctx === undefined || sending || !canRace()) return;
    // Clicks made before the answer that set off a mine: the bot would refuse them now
    if (frozenMs() > 0) queue = [];
    if (queue.length === 0 && !wantBoard) return;
    sending = true;
    wantBoard = false;
    sent = queue.splice(0, MAX_ACTS);
    try {
        const response = await ctx.oc.fetch("/api/minesweeper/act", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ acts: sent }),
        });
        const result = (await response.json()) as ActResponse;
        if (result.own !== undefined) takeOwn(result.own);
        // No board, eg. the game's gone: the page leaves the bot a while before asking again
        else retryAt = Date.now() + RETRY_MS;
        if (!result.ok) ctx.notice(result.error);
    } catch {
        ctx.notice("Couldn't reach the game");
        retryAt = Date.now() + RETRY_MS;
    }
    // A state may have said the board was behind while this was being answered, which it may be
    // no longer
    if (!behind()) wantBoard = false;
    sent = [];
    sending = false;
    render();
    void flush();
}

function send(act: Act) {
    queue.push(act);
    render();
    void flush();
}

/** The racer's board as it's to be drawn: the bot's, with the flags it hasn't answered yet */
function myCells(): string[] | undefined {
    if (own === undefined) return undefined;
    const cells = [...own.board.view];
    for (const act of [...sent, ...queue]) {
        if (!("flag" in act)) continue;
        if (cells[act.flag] === (act.on ? HIDDEN : FLAG)) cells[act.flag] = act.on ? FLAG : HIDDEN;
    }
    return cells;
}

/** The cells the racer's opening, that the bot hasn't answered yet */
function pressed(): Set<number> {
    const cells = new Set<number>();
    for (const act of [...sent, ...queue]) {
        if ("reveal" in act) cells.add(act.reveal);
        else if ("chord" in act) cells.add(act.chord);
    }
    return cells;
}

const isNumber = (c: string | undefined) => c !== undefined && c >= "1" && c <= "8";

/** A tap, or a left click: opens a cell, or, in flag mode, flags it */
function primary(cell: number) {
    const cells = myCells();
    if (!canRace() || cells === undefined || frozenMs() > 0) return;
    if (isNumber(cells[cell])) chord(cells, cell, latest!.size);
    else if (flagMode) toggleFlag(cells, cell);
    else if (cells[cell] === HIDDEN) send({ reveal: cell });
}

/** A long press, or a right click: flags a cell, or, in flag mode, opens it */
function secondary(cell: number) {
    const cells = myCells();
    if (!canRace() || cells === undefined || frozenMs() > 0) return;
    if (isNumber(cells[cell])) chord(cells, cell, latest!.size);
    else if (!flagMode) toggleFlag(cells, cell);
    else if (cells[cell] === HIDDEN) send({ reveal: cell });
}

function toggleFlag(cells: string[], cell: number) {
    if (cells[cell] === HIDDEN) send({ flag: cell, on: true });
    else if (cells[cell] === FLAG) send({ flag: cell, on: false });
}

/** Opens round a number, if it has as many flags round it as it says, and anything to open */
function chord(cells: string[], cell: number, size: number) {
    const around = neighbours(size, cell);
    const marked = around.filter((n) => cells[n] === FLAG || cells[n] === BOOM).length;
    if (marked === Number(cells[cell]) && around.some((n) => cells[n] === HIDDEN)) {
        send({ chord: cell });
    }
}

function ensureDom(body: HTMLElement) {
    if (dom !== undefined && body.contains(dom.root)) return;
    body.innerHTML = `
        <div class="ms">
            <p class="ms-status"></p>
            <div class="ms-bar">
                <span class="ms-left"></span>
                <button class="ms-mode" data-action="mode" aria-pressed="false">${FLAG_SVG}<span>Flag</span></button>
            </div>
            <div class="ms-wrap">
                <div class="ms-board" role="grid" aria-label="The minefield"></div>
                <div class="ms-frozen" hidden></div>
            </div>
            <p class="ms-hint muted small"></p>
            <ol class="ms-standings"></ol>
        </div>`;
    const root = body.firstElementChild as HTMLElement;
    const q = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
    dom = {
        root,
        status: q(".ms-status"),
        bar: q(".ms-bar"),
        left: q(".ms-left"),
        mode: q(".ms-mode"),
        wrap: q(".ms-wrap"),
        board: q(".ms-board"),
        frozen: q(".ms-frozen"),
        hint: q(".ms-hint"),
        standings: q(".ms-standings"),
        cells: [],
        drawn: [],
        rows: new Map(),
    };
    fitted = "";
    listen(dom.board);
}

// A press on a cell: a tap or a left click is the primary action, a long press with a finger or a
// pen, or a right click, the other. A press that wanders is a scroll, and does nothing.
function listen(board: HTMLElement) {
    let press:
        | { cell: number; id: number; x: number; y: number; long: boolean; timer: number }
        | undefined;
    const cancel = () => {
        if (press !== undefined) clearTimeout(press.timer);
        press = undefined;
    };
    const cellAt = (event: PointerEvent) => {
        const el = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
        return el === null ? undefined : Number(el.dataset.cell);
    };
    board.addEventListener("pointerdown", (event) => {
        const cell = cellAt(event);
        if (cell === undefined) return;
        cancel();
        if (event.button === 2) {
            secondary(cell);
            return;
        }
        if (event.button !== 0) return;
        if (event.pointerType === "mouse") {
            press = {
                cell,
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                long: false,
                timer: 0,
            };
            return;
        }
        const timer = window.setTimeout(() => {
            if (press === undefined) return;
            press.long = true;
            navigator.vibrate?.(15);
            secondary(press.cell);
        }, LONG_PRESS_MS);
        press = {
            cell,
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            long: false,
            timer,
        };
    });
    board.addEventListener("pointermove", (event) => {
        if (press === undefined || press.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > PRESS_SLOP_PX) cancel();
    });
    board.addEventListener("pointerup", (event) => {
        if (press === undefined || press.id !== event.pointerId) return;
        const { cell, long } = press;
        cancel();
        if (!long) primary(cell);
    });
    board.addEventListener("pointercancel", cancel);
    board.addEventListener("contextmenu", (event) => event.preventDefault());
}

function name(s: SharedState, id: string | undefined): string {
    if (id === undefined) return "Nobody";
    return usernameOf(id) ?? s.names[id] ?? id.slice(0, 5);
}

/** Everyone, the furthest on first: the most cleared, then the fewest mines */
function ranked(s: SharedState): RacerState[] {
    // Level on both, the winner first: the bot gives a tie to whoever got there first
    const won = (r: RacerState) => (r.id === s.winner ? 1 : 0);
    return [...s.racers].sort(
        (a, b) => b.cleared - a.cleared || a.hits - b.hits || won(b) - won(a),
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
    const me = ctx.oc.userId;
    const finished = s.phase === "finished";
    const racing = canRace();
    const mine = s.racers.find((r) => r.id === me);

    // Whose board: the racer's own, or once it's over, whoever's picked, or the winner
    let cells: string[] | undefined;
    let whose: string | undefined;
    if (finished) {
        whose =
            s.racers.find((r) => r.id === picked)?.id ?? mine?.id ?? s.winner ?? ranked(s)[0]?.id;
        cells = [...(s.racers.find((r) => r.id === whose)?.view ?? "")];
    } else if (racing) {
        whose = me;
        cells = myCells() ?? Array.from({ length: s.size * s.size }, () => HIDDEN);
    }

    if (finished) {
        dom.status.textContent =
            s.winner === undefined
                ? "The race is over"
                : s.ended === "cleared" && s.startedAt !== undefined && s.finishedAt !== undefined
                  ? `${name(s, s.winner)} cleared the field in ${duration(s.finishedAt - s.startedAt)}`
                  : `Time's up! ${name(s, s.winner)} cleared the most`;
    } else {
        dom.status.textContent = racing
            ? "Open every cell that isn't a mine"
            : "Watching: the boards show when the race is over";
    }

    const showBoard = cells !== undefined && cells.length === s.size * s.size;
    dom.wrap.hidden = !showBoard;
    dom.bar.hidden = !showBoard;
    dom.root.classList.toggle("ms-watching", !showBoard);
    if (showBoard) {
        // How many are left to flag while it's on; once it's over, how many there were
        const flagged = cells!.filter((c) => c === FLAG || c === BOOM).length;
        dom.left.innerHTML = finished
            ? `${MINE_SVG}<span><strong>${s.mines}</strong> mines</span>`
            : `${MINE_SVG}<span><strong>${s.mines - flagged}</strong> left</span>`;
        dom.mode.hidden = !racing;
        dom.mode.setAttribute("aria-pressed", String(flagMode));
        dom.mode.classList.toggle("on", flagMode);
        drawBoard(s, cells!, finished);
    }
    renderFrozen(racing);
    renderHint(s, racing, finished, whose);
    renderStandings(s, finished, whose);
    fitBoard();
}

function drawBoard(s: SharedState, cells: string[], finished: boolean) {
    if (dom === undefined) return;
    const n = s.size;
    if (dom.cells.length !== n * n) {
        dom.board.style.setProperty("--n", String(n));
        dom.cells = Array.from({ length: n * n }, (_, i) => {
            const el = document.createElement("div");
            el.dataset.cell = String(i);
            el.setAttribute("role", "gridcell");
            return el;
        });
        dom.drawn = dom.cells.map(() => "");
        // A row a line of cells, for the grid's roles, laid out as if they weren't there
        const rows = Array.from({ length: n }, (_, y) => {
            const row = document.createElement("div");
            row.className = "ms-row";
            row.setAttribute("role", "row");
            row.append(...dom!.cells.slice(y * n, (y + 1) * n));
            return row;
        });
        dom.board.replaceChildren(...rows);
    }
    const mines = finished ? new Set(s.mineCells ?? []) : undefined;
    const opening = finished ? new Set<number>() : pressed();
    cells.forEach((c, i) => {
        const look = cellLook(c, mines?.has(i), opening.has(i));
        const key = `${look.cls}:${look.label}`;
        if (dom!.drawn[i] === key) return;
        dom!.drawn[i] = key;
        const el = dom!.cells[i];
        el.className = look.cls;
        el.innerHTML = look.html;
        el.setAttribute("aria-label", look.label);
    });
}

type Look = { cls: string; html: string; label: string };

/**
 * What a cell is drawn as, its classes and content, and what it's called: `mine` once the race is
 * over, to show the mines left hidden and the flags in the wrong place
 */
function cellLook(c: string, mine: boolean | undefined, opening: boolean): Look {
    if (c === HIDDEN) {
        if (mine === true)
            return { cls: "ms-cell ms-hidden ms-mine", html: MINE_SVG, label: "Mine" };
        const cls = `ms-cell ms-hidden${opening ? " ms-pressed" : ""}`;
        return { cls, html: "", label: "Hidden" };
    }
    if (c === FLAG) {
        const wrong = mine === false;
        return {
            cls: `ms-cell ms-hidden ms-flag${wrong ? " ms-wrong" : ""}`,
            html: FLAG_SVG,
            label: wrong ? "Flag, no mine" : "Flag",
        };
    }
    if (c === BOOM) return { cls: "ms-cell ms-boom", html: MINE_SVG, label: "Mine, set off" };
    return {
        cls: `ms-cell ms-open ms-n${c}`,
        html: c === "0" ? "" : c,
        label: c === "0" ? "Open" : c,
    };
}

function renderFrozen(racing: boolean) {
    if (dom === undefined) return;
    const left = racing ? frozenMs() : 0;
    dom.frozen.hidden = left === 0;
    clearTimeout(frozenTimer);
    if (left === 0) return;
    dom.frozen.innerHTML = `${MINE_SVG}<strong>Boom!</strong><span>Back in ${Math.ceil(left / 1000)}s</span>`;
    // Again as the count goes down a second, and as it runs out
    frozenTimer = setTimeout(render, (left % 1000) + 20);
}

function renderHint(s: SharedState, racing: boolean, finished: boolean, whose: string | undefined) {
    if (dom === undefined) return;
    const touch = !matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (finished) {
        const board = whose === ctx?.oc.userId ? "Your board" : `${name(s, whose)}'s board`;
        dom.hint.textContent = s.racers.length > 1 ? `${board}. Tap a name for theirs.` : board;
    } else if (racing && own === undefined) {
        dom.hint.textContent = "Getting your board…";
    } else if (racing) {
        const open = touch ? "Tap" : "Click";
        dom.hint.textContent = flagMode
            ? `${open} to flag, hold to open. ${open} a number to open round it.`
            : touch
              ? "Tap to open, hold to flag. Tap a number to open round it."
              : "Click to open, right-click to flag. Click a number to open round it.";
    } else {
        dom.hint.textContent = "";
    }
    dom.hint.hidden = dom.hint.textContent === "";
}

function renderStandings(s: SharedState, finished: boolean, whose: string | undefined) {
    if (dom === undefined) return;
    const me = ctx?.oc.userId;
    const safe = s.size * s.size - s.mines;
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
        row.fill.style.width = `${Math.round((100 * r.cleared) / safe)}%`;
        const count = r.cleared === safe ? "Cleared" : `${r.cleared}/${safe}`;
        if (row.count.textContent !== count) row.count.textContent = count;
        row.hits.hidden = r.hits === 0;
        const hits = `${MINE_SVG}${r.hits}`;
        if (row.hits.innerHTML !== hits) row.hits.innerHTML = hits;
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
    const bar = document.createElement("span");
    bar.className = "ms-progress";
    const fill = document.createElement("span");
    bar.append(fill);
    const count = document.createElement("span");
    count.className = "count";
    const hits = document.createElement("span");
    hits.className = "ms-hits";
    hits.title = "Mines set off";
    li.append(who, bar, count, hits);
    return { li, who, fill, count, hits };
}

// The field is square: as wide as the frame, unless what's around it leaves less height than that.
// Its numbers are sized to its cells. Measuring lays the page out, so it's done again only when
// what's round the field has changed, or the frame has.
let fitted = "";

function fitBoard(force = false) {
    if (dom === undefined || dom.wrap.hidden || !document.body.contains(dom.root)) return;
    const around = [
        dom.cells.length,
        dom.status.textContent,
        dom.bar.hidden,
        dom.mode.hidden,
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
    const side = Math.max(180, Math.floor(available - used));
    dom.wrap.style.maxWidth = `${side}px`;
    const n = Math.sqrt(dom.cells.length) || 1;
    const width = Math.min(side, dom.root.clientWidth);
    dom.board.style.setProperty("--cell-font", `${Math.max(9, Math.floor((width / n) * 0.6))}px`);
}

function mmss(ms: number, round = false): string {
    const seconds = Math.max(0, (round ? Math.round : Math.floor)(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
