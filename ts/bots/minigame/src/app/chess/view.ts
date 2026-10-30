// The chess view: the board from the shared state's FEN, seen from the player's side, with a clock
// each, counting down from the state's `clock.at`; the moves; Offer draw and Resign, and the piece
// to promote to when a pawn reaches the end. A player taps a piece, then the square to move it to,
// and the move goes to the bot as UCI. The bot answers with the new state, which is shown until
// OpenChat relays the next.
//
// Once the game's over, the card keeps how it ended, which OpenChat hands the page as the end
// state: the result, who played, the moves, and the position before each move and after the last.
// The view then shows the final position and lets the viewer step through the game: Previous and
// Next, the arrow keys, or a tap on a move.
import {
    GAME_ID,
    STATE_VERSION,
    type ActionResponse,
    type LastMove,
    type SharedState,
    type Side,
} from "../../games/chess/types";
import { CHESS_SETTINGS, WHITE_IS_HOST, WHITE_IS_OPPONENT } from "../../games/chess/settings";
import type { BaseState, GameView, Lobby, ViewContext } from "../view";

const LOW_TIME_MS = 20_000;
const RESIGN_CONFIRM_MS = 4000;
const FILES = "abcdefgh";
const GLYPHS: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** The end state as the view reads it: anything odd is left out rather than trusted */
type End = {
    result: string | null;
    white: string | null;
    black: string | null;
    names: Record<string, string>;
    moves: string[];
    fens: string[];
    lastMove: LastMove | null;
    /** A game too long for the card keeps only its final position, so there's nothing to step through */
    truncated: boolean;
};

type Dom = {
    root: HTMLElement;
    status: HTMLElement;
    top: HTMLElement;
    bottom: HTMLElement;
    board: HTMLElement;
    offer: HTMLElement;
    controls: HTMLElement;
    draw: HTMLButtonElement;
    resign: HTMLButtonElement;
    replay: HTMLElement;
    previous: HTMLButtonElement;
    next: HTMLButtonElement;
    ply: HTMLElement;
    error: HTMLElement;
    moves: HTMLElement;
    promotion: HTMLElement;
};

let ctx: ViewContext | undefined;
let dom: Dom | undefined;
/** The live state shown, or undefined once the game's over */
let shared: SharedState | undefined;
/** The bot's answer to the player's last request, shown until OpenChat sends a newer state */
let pending: { shared: SharedState; seq: number | undefined } | undefined;
/** How the game ended, from the card, once it has it, and the object it was read from */
let end: End | undefined;
let endSource: unknown;
/** Which position of the finished game is shown, as an index into its FENs: 0 is before any move */
let ply = 0;
/** The square of the piece picked up, if any, and a promotion waiting for its piece */
let selected: string | undefined;
let promotion: string | undefined;
/** A request on its way to the bot, during which the board takes no taps */
let sending = false;
/** The timer during which a second tap on Resign resigns */
let resignArmed: ReturnType<typeof setTimeout> | undefined;

export const chessView: GameView = {
    id: GAME_ID,
    title: "Chess",
    stateVersion: STATE_VERSION,

    attach(_root, context) {
        ctx = context;
        setInterval(tickClocks, 100);
        window.addEventListener("resize", fitBoard);
    },

    isOpen(state) {
        return (state as SharedState).status === "Open";
    },

    lobby(state): Lobby {
        const s = state as SharedState;
        const { white, minutes, increment } = s.settings;
        const host = s.host === null ? undefined : (s.names[s.host] ?? shortId(s.host));
        const whiteText =
            white === WHITE_IS_HOST && host !== undefined
                ? `<strong>${escape(host)}</strong> plays as White`
                : white === WHITE_IS_OPPONENT && host !== undefined
                  ? `<strong>${escape(host)}</strong>'s opponent plays as White`
                  : "White chosen at random";
        // One line of what's set, the increment only when there is one: people know the rules
        const parts = [`<strong>${minutes} minute${minutes === 1 ? "" : "s"}</strong> each`];
        if (increment > 0) {
            parts.push(
                `<strong>${increment} second${increment === 1 ? "" : "s"}</strong> added per move`,
            );
        }
        parts.push(whiteText);
        return {
            blurb: `${parts.join(", ")}.`,
            seats: s.players.map((id) => ({ id, name: s.names[id] ?? shortId(id) })),
            hint: "Start once you're both here.",
            settings: {
                specs: CHESS_SETTINGS,
                current: s.settings,
                host: s.host ?? undefined,
                hostName: s.host === null ? undefined : s.names[s.host],
            },
        };
    },

    renderLive(body, state) {
        const live = state as SharedState;
        // The bot's answer to the player's own request is newer than the state OpenChat has
        // relayed, until the next state comes
        if (pending !== undefined && pending.seq !== ctx?.oc.state?.seq) pending = undefined;
        if (shared !== live && pending === undefined) selected = undefined;
        shared = pending?.shared ?? live;
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
            // The final position first
            ply = end.fens.length - 1;
            selected = undefined;
            promotion = undefined;
            disarmResign();
        }
        ensureDom(body);
        render();
        return true;
    },

    clock() {
        return "";
    },

    onKey(event) {
        if (!canStep()) return false;
        if (event.key === "ArrowLeft") step(ply - 1);
        else if (event.key === "ArrowRight") step(ply + 1);
        else return false;
        return true;
    },

    onAction(action, el) {
        switch (action) {
            case "square":
                onSquare(el.dataset.square!);
                break;
            case "draw":
                void call("/api/chess/draw");
                break;
            case "resign":
                // Resigning takes two taps, a few seconds apart at most: the frame has no dialogs
                if (resignArmed === undefined) {
                    if (dom !== undefined) dom.resign.textContent = "Tap again to resign";
                    resignArmed = setTimeout(disarmResign, RESIGN_CONFIRM_MS);
                } else {
                    disarmResign();
                    void call("/api/chess/resign");
                }
                break;
            case "promote":
                if (promotion !== undefined) sendMove(promotion + el.dataset.piece);
                promotion = undefined;
                if (dom !== undefined) dom.promotion.hidden = true;
                break;
            case "cancel-promotion":
                promotion = undefined;
                if (dom !== undefined) dom.promotion.hidden = true;
                break;
            case "previous":
                step(ply - 1);
                break;
            case "next":
                step(ply + 1);
                break;
            case "ply":
                if (canStep()) step(Number(el.dataset.ply));
                break;
        }
    },
};

// The end state, read with care: it's whatever the bot that ended the game wrote to the card, which
// the card keeps for good, so an older version of it is read too, as far as it can be
function readEnd(state: unknown): End | undefined {
    if (state === null || typeof state !== "object") return undefined;
    const s = state as Record<string, unknown>;
    if (s.game !== GAME_ID || typeof s.version !== "number" || s.version > STATE_VERSION) {
        return undefined;
    }
    const strings = (list: unknown) =>
        Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
    const id = (value: unknown) => (typeof value === "string" ? value : null);
    const lastMove = s.last_move as Record<string, unknown> | null | undefined;
    const names: Record<string, string> = {};
    if (s.names !== null && typeof s.names === "object") {
        for (const [k, v] of Object.entries(s.names)) if (typeof v === "string") names[k] = v;
    }
    const fens = strings(s.fens);
    return {
        result: id(s.result),
        white: id(s.white),
        black: id(s.black),
        names,
        moves: strings(s.moves),
        fens: fens.length === 0 ? [START_FEN] : fens,
        lastMove:
            lastMove !== null &&
            typeof lastMove === "object" &&
            typeof lastMove.from === "string" &&
            typeof lastMove.to === "string"
                ? { from: lastMove.from, to: lastMove.to }
                : null,
        truncated: s.truncated === true,
    };
}

function ensureDom(body: HTMLElement) {
    if (dom !== undefined && body.contains(dom.root)) return;
    body.innerHTML = `
        <div class="chess">
            <p class="chess-status"></p>
            <div class="player-row" data-pos="top"><span class="name"></span><span class="chess-clock"></span></div>
            <div class="board" role="grid" aria-label="Chess board"></div>
            <div class="player-row" data-pos="bottom"><span class="name"></span><span class="chess-clock"></span></div>
            <p class="offer"></p>
            <div class="chess-controls" hidden>
                <button type="button" data-action="draw">Offer draw</button>
                <button type="button" data-action="resign">Resign</button>
            </div>
            <div class="replay-row" hidden>
                <button type="button" data-action="previous">‹ Previous</button>
                <span class="ply"></span>
                <button type="button" data-action="next">Next ›</button>
            </div>
            <p class="chess-error" role="alert"></p>
            <div class="moves" hidden></div>
            <div class="promotion" hidden>
                <div>
                    <p>Promote to</p>
                    <button type="button" class="piece-choice" data-action="promote" data-piece="q">♛</button>
                    <button type="button" class="piece-choice" data-action="promote" data-piece="r">♜</button>
                    <button type="button" class="piece-choice" data-action="promote" data-piece="b">♝</button>
                    <button type="button" class="piece-choice" data-action="promote" data-piece="n">♞</button>
                    <br>
                    <button type="button" data-action="cancel-promotion">Cancel</button>
                </div>
            </div>
        </div>`;
    const root = body.firstElementChild as HTMLElement;
    const q = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
    dom = {
        root,
        status: q(".chess-status"),
        top: q('.player-row[data-pos="top"]'),
        bottom: q('.player-row[data-pos="bottom"]'),
        board: q(".board"),
        offer: q(".offer"),
        controls: q(".chess-controls"),
        draw: q('[data-action="draw"]'),
        resign: q('[data-action="resign"]'),
        replay: q(".replay-row"),
        previous: q('[data-action="previous"]'),
        next: q('[data-action="next"]'),
        ply: q(".ply"),
        error: q(".chess-error"),
        moves: q(".moves"),
        promotion: q(".promotion"),
    };
}

// Calls the bot's API with the player's token. The bot answers the new state, which is shown
// until OpenChat relays the next.
async function call(path: string, body?: unknown) {
    if (ctx === undefined) return;
    showError("");
    sending = true;
    try {
        const init: RequestInit = { method: "POST" };
        if (body !== undefined) {
            init.headers = { "content-type": "application/json" };
            init.body = JSON.stringify(body);
        }
        const response = await ctx.oc.fetch(path, init);
        const result = (await response.json().catch(() => undefined)) as ActionResponse | undefined;
        if (result === undefined) throw new Error(`The bot answered ${response.status}`);
        if (!result.ok) throw new Error(result.error);
        pending = { shared: result.shared, seq: ctx.oc.state?.seq };
        shared = result.shared;
    } catch (err) {
        showError(err instanceof Error ? err.message : "Couldn't reach the game");
    } finally {
        sending = false;
        render();
    }
}

function sendMove(uci: string) {
    selected = undefined;
    renderBoard();
    void call("/api/chess/move", { uci });
}

function disarmResign() {
    clearTimeout(resignArmed);
    resignArmed = undefined;
    if (dom !== undefined) dom.resign.textContent = "Resign";
}

function showError(text: string) {
    if (dom !== undefined) dom.error.textContent = text;
}

/** Whether the viewer can step through the game: it's over, and the card kept every position */
function canStep(): boolean {
    return end !== undefined && !end.truncated && end.fens.length > 1;
}

/** Shows the finished game's position after `to` moves */
function step(to: number) {
    if (end === undefined || !canStep()) return;
    ply = Math.max(0, Math.min(end.fens.length - 1, to));
    renderBoard();
    renderMoves();
    renderReplay();
}

/** The side the user plays, if they're a player in a started game, or played in a finished one */
function myColor(): Side | undefined {
    const oc = ctx?.oc;
    const sides = end ?? shared;
    if (oc === undefined || oc.role !== "player" || sides === undefined) return undefined;
    if (sides.white === oc.userId) return "white";
    if (sides.black === oc.userId) return "black";
    return undefined;
}

function canMove(): boolean {
    return (
        !sending &&
        end === undefined &&
        ctx?.oc.finished !== true &&
        shared !== undefined &&
        shared.status === "Active" &&
        myColor() === shared.turn
    );
}

// A tap on a square: picks up one of the player's pieces, puts it down on a square it can move to,
// or puts it back
function onSquare(square: string) {
    if (!canMove() || shared === undefined) return;
    const moves = shared.legal_moves ?? [];
    if (selected !== undefined && selected !== square) {
        const candidates = moves.filter((m) => m.startsWith(selected! + square));
        if (candidates.length > 0) {
            if (candidates.some((m) => m.length === 5)) {
                promotion = selected + square;
                if (dom !== undefined) dom.promotion.hidden = false;
            } else {
                sendMove(candidates[0]);
            }
            return;
        }
    }
    selected =
        selected !== square && moves.some((m) => m.startsWith(square)) ? square : undefined;
    renderBoard();
}

function shortId(id: string): string {
    return id.length > 13 ? `${id.slice(0, 5)}…${id.slice(-5)}` : id;
}

function sideName(color: Side): string {
    return color === "white" ? "White" : "Black";
}

/** The pieces on the board, by square, from the position's FEN */
function pieces(fen: string): Record<string, string> {
    const placed: Record<string, string> = {};
    const rows = fen.split(" ")[0].split("/");
    rows.forEach((row, i) => {
        const rank = 8 - i;
        let file = 0;
        for (const ch of row) {
            if (ch >= "1" && ch <= "8") {
                file += Number(ch);
            } else {
                placed[FILES[file] + rank] = ch;
                file++;
            }
        }
    });
    return placed;
}

/** The squares a move changed: where the piece left, where it went, and the rook's too when castling */
function changedSquares(before: Record<string, string>, after: Record<string, string>): Set<string> {
    const changed = new Set<string>();
    for (const square of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (before[square] !== after[square]) changed.add(square);
    }
    return changed;
}

/**
 * The board's a square, as wide as the frame unless the rows around it leave less height than
 * that: then it's as tall as they leave, so nothing's cut off in the card's frame
 */
function fitBoard() {
    if (dom === undefined || !document.body.contains(dom.root)) return;
    const root = dom.root;
    let used = 0;
    for (const el of root.children) {
        if (el === dom.board) continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.position === "fixed") continue;
        used += (el as HTMLElement).offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    }
    const boardStyle = getComputedStyle(dom.board);
    used += parseFloat(boardStyle.marginTop) + parseFloat(boardStyle.marginBottom);
    // What's below the view's top in the frame, less a little for the page's padding
    const available = document.documentElement.clientHeight - root.getBoundingClientRect().top - 16;
    const max = Math.max(160, available - used);
    dom.board.style.setProperty("--board-max", `${Math.floor(max)}px`);
}

function render() {
    if (dom === undefined) return;
    renderStatus();
    renderPlayers();
    renderBoard();
    renderMoves();
    renderReplay();
    tickClocks();
    fitBoard();
}

function renderStatus() {
    if (dom === undefined) return;
    const mine = myColor();
    const player = ctx?.oc.role === "player";
    // A game that's over is only looked at. OpenChat shows the result over the app too, so it's
    // only the status line here.
    if (end !== undefined || shared === undefined || shared.status === "Finished") {
        dom.status.textContent = end?.result ?? shared?.result ?? "Game over";
        dom.offer.textContent = "";
        dom.controls.hidden = true;
        return;
    }
    let text: string;
    let offer = "";
    if (shared.status === "Open") {
        text = "Waiting for the game to start";
    } else {
        const turn = shared.turn ?? "white";
        text = mine === turn ? "Your move" : `${sideName(turn)} to move`;
        if (shared.check) text += " · Check";
        if (shared.draw_offer) {
            offer =
                shared.draw_offer === mine
                    ? "You've offered a draw"
                    : `${sideName(shared.draw_offer)} offers a draw`;
        }
    }
    dom.status.textContent = text;
    dom.offer.textContent = offer;
    const playing = player && mine !== undefined && shared.status === "Active" && ctx?.oc.finished !== true;
    dom.controls.hidden = !playing;
    if (playing) {
        const theirs = mine === "white" ? "black" : "white";
        dom.draw.textContent = shared.draw_offer === theirs ? "Accept draw" : "Offer draw";
        dom.draw.disabled = shared.draw_offer === mine || sending;
        dom.resign.disabled = sending;
    }
}

/** The user's side at the bottom, or White if they're watching */
function flipped(): boolean {
    return myColor() === "black";
}

function renderPlayers() {
    if (dom === undefined) return;
    const oc = ctx?.oc;
    // Who played, from the end state once the game's over, as it may be all the page has
    const sides = end ?? shared;
    const names = sides?.names ?? {};
    const describe = (color: Side) => {
        const id = sides?.[color] ?? undefined;
        if (id === undefined || id === null) {
            return `<span class="side">${sideName(color)}</span>`;
        }
        const who =
            id === oc?.userId
                ? "you"
                : `<span class="who" title="${escape(id)}">${escape(names[id] ?? shortId(id))}</span>`;
        return `<span class="side">${sideName(color)}</span> · ${who}`;
    };
    const bottomColor: Side = flipped() ? "black" : "white";
    const topColor: Side = flipped() ? "white" : "black";
    dom.bottom.querySelector(".name")!.innerHTML = describe(bottomColor);
    dom.top.querySelector(".name")!.innerHTML = describe(topColor);
    dom.bottom.dataset.color = bottomColor;
    dom.top.dataset.color = topColor;
    const running = end !== undefined ? null : (shared?.clock?.running ?? null);
    dom.bottom.classList.toggle("active", running === bottomColor);
    dom.top.classList.toggle("active", running === topColor);
    // The clocks mean nothing once the game's over
    for (const panel of [dom.top, dom.bottom]) {
        (panel.querySelector(".chess-clock") as HTMLElement).hidden = end !== undefined;
    }
}

function renderBoard() {
    if (dom === undefined) return;
    const replay = end !== undefined;
    const fen = end !== undefined ? end.fens[ply] : (shared?.fen ?? START_FEN);
    const placed = pieces(fen);
    const flip = flipped();
    const moves = canMove() ? (shared?.legal_moves ?? []) : [];
    const targets =
        selected === undefined
            ? new Set<string>()
            : new Set(moves.filter((m) => m.startsWith(selected!)).map((m) => m.slice(2, 4)));
    const movable = new Set(moves.map((m) => m.slice(0, 2)));
    // The squares of the move just played: in a finished game, those which differ from the position
    // before it, or the last move's if that's all the card kept
    let last = new Set<string>();
    if (!replay) {
        if (shared?.last_move) last = new Set([shared.last_move.from, shared.last_move.to]);
    } else if (ply > 0) {
        last = changedSquares(pieces(end!.fens[ply - 1]), placed);
    } else if (end!.truncated && end!.lastMove !== null) {
        last = new Set([end!.lastMove.from, end!.lastMove.to]);
    }
    // The king in check, if any
    let checked: string | undefined;
    if (!replay && shared?.check && shared.status === "Active") {
        const king = shared.turn === "white" ? "K" : "k";
        checked = Object.keys(placed).find((square) => placed[square] === king);
    }

    const squares: HTMLElement[] = [];
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const file = flip ? 7 - col : col;
            const rank = flip ? row + 1 : 8 - row;
            const square = FILES[file] + rank;
            const div = document.createElement("div");
            // a1 is dark, as is every square whose file and rank add up odd, counting the file from 0
            div.className = `sq ${(file + rank) % 2 === 1 ? "dark" : "light"}`;
            div.dataset.square = square;
            div.dataset.action = "square";
            div.setAttribute("role", "gridcell");
            if (last.has(square)) div.classList.add("last");
            if (checked === square) div.classList.add("check");
            if (selected === square) div.classList.add("selected");
            if (targets.has(square)) {
                div.classList.add("target");
                if (placed[square] !== undefined) div.classList.add("capture");
            }
            if (movable.has(square) || targets.has(square)) div.classList.add("movable");
            const piece = placed[square];
            if (piece !== undefined) {
                const span = document.createElement("span");
                span.className = `piece ${piece === piece.toUpperCase() ? "w" : "b"}`;
                span.textContent = GLYPHS[piece.toLowerCase()] ?? "";
                div.append(span);
                div.setAttribute("aria-label", `${square} ${piece}`);
            } else {
                div.setAttribute("aria-label", square);
            }
            if (col === 0) {
                const coord = document.createElement("span");
                coord.className = "coord rank";
                coord.textContent = String(rank);
                div.append(coord);
            }
            if (row === 7) {
                const coord = document.createElement("span");
                coord.className = "coord file";
                coord.textContent = FILES[file];
                div.append(coord);
            }
            squares.push(div);
        }
    }
    dom.board.replaceChildren(...squares);
}

function renderMoves() {
    if (dom === undefined) return;
    const moves = end !== undefined ? end.moves : (shared?.moves ?? []);
    const stepping = canStep();
    // The move whose position is shown: the one just played, or the one stepped to
    const current = stepping ? ply - 1 : moves.length - 1;
    dom.moves.hidden = moves.length === 0;
    dom.moves.classList.toggle("replay", stepping);
    const cells: HTMLElement[] = [];
    for (let i = 0; i < moves.length; i += 2) {
        const n = document.createElement("span");
        n.className = "n";
        n.textContent = `${i / 2 + 1}.`;
        cells.push(n);
        for (const j of [i, i + 1]) {
            const m = document.createElement("span");
            m.className = "m";
            if (j === current) m.classList.add("latest");
            if (stepping && j < moves.length) {
                m.dataset.action = "ply";
                m.dataset.ply = String(j + 1);
            }
            m.textContent = moves[j] ?? "";
            cells.push(m);
        }
    }
    dom.moves.replaceChildren(...cells);
    // Keep the current move in view: the latest, or the one stepped to, scrolled to within the
    // list itself, so as not to scroll the page the app is framed in. Before any move, the top.
    const shown = dom.moves.querySelector<HTMLElement>(".m.latest");
    if (stepping) {
        dom.moves.scrollTop =
            shown === null
                ? 0
                : Math.max(0, shown.offsetTop - dom.moves.offsetTop - dom.moves.clientHeight / 2);
    } else {
        dom.moves.scrollTop = dom.moves.scrollHeight;
    }
}

/** The row under the board of a finished game: where the viewer is in it, and the buttons to step */
function renderReplay() {
    if (dom === undefined) return;
    const stepping = canStep();
    dom.replay.hidden = !stepping;
    if (!stepping || end === undefined) return;
    dom.previous.disabled = ply === 0;
    dom.next.disabled = ply === end.fens.length - 1;
    // eg. "3. Nf3" for White's third move, "3… Nf6" for Black's
    const number = Math.ceil(ply / 2);
    dom.ply.textContent =
        ply === 0 ? "Start" : `${number}${ply % 2 === 1 ? "." : "…"} ${end.moves[ply - 1] ?? ""}`;
}

function formatClock(ms: number): string {
    if (ms < 10_000) return `0:0${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.floor((ms % 60_000) / 1000);
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// What each side has left: the state's figure, less the time since the bot took it for the side
// whose clock is running. A state can be old when it arrives, as the service sends the latest one
// to whoever opens the game, so it's counted from the bot's time, taking the two clocks to agree.
function tickClocks() {
    if (dom === undefined || end !== undefined || !document.body.contains(dom.root)) return;
    for (const panel of [dom.top, dom.bottom]) {
        const clockText = panel.querySelector(".chess-clock") as HTMLElement;
        const clock = shared?.clock;
        if (!clock) {
            clockText.textContent = "10:00";
            clockText.classList.remove("low");
            continue;
        }
        const color = panel.dataset.color as Side;
        let ms = clock[`${color}_ms`];
        if (clock.running === color) ms = Math.max(0, ms - Math.max(0, Date.now() - clock.at));
        clockText.textContent = formatClock(ms);
        clockText.classList.toggle("low", clock.running === color && ms < LOW_TIME_MS);
    }
}

function escape(text: string): string {
    return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
