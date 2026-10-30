// The 2048 race's view: every player's board from the shared state, and the player's own moves to
// the bot. A move is applied to the player's board as soon as it's made, with the bot's answer
// confirming it and adding the new tile.
//
// The race's boards animate (`board.ts`), so their elements are kept and brought up to date, and
// the rest of the race view with them.
//
// Once the race is over, the bot's end state is its final shared state, so a finished race is drawn
// the same way, from the end state: on connecting to a finished card, when no state comes at all,
// and as the race finishes while the page is open. Nothing is sent to the bot after that.
import { slide, type Board, type Direction } from "../../games/race2048/engine";
import {
    GAME_ID,
    STATE_VERSION,
    type MoveResponse,
    type PlayerView,
    type SharedState,
} from "../../games/race2048/types";
import { RACE_SETTINGS } from "../../games/race2048/settings";
import type { BaseState, GameView, Lobby, ViewContext } from "../view";
import { BoardView } from "./board";

/** The player's own board, as last confirmed by the bot or predicted from a move */
type Own = { board: Board; rev: number; score: number; best: number; dead: boolean; won: boolean };

let ctx: ViewContext | undefined;
let own: Own | undefined;
/** The direction of the player's own move being drawn, for the board to slide */
let ownMove: Direction | undefined;
let sending = false;
let queued: Direction | undefined;
// The frame only gets the keys once the player has clicked in it, as it's in the chat
let focused = document.hasFocus();

const KEYS: Record<string, Direction> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
    W: "up",
    S: "down",
    A: "left",
    D: "right",
};

export const raceView: GameView = {
    id: GAME_ID,
    title: "2048 Race",
    stateVersion: STATE_VERSION,

    attach(root, context) {
        ctx = context;
        window.addEventListener("focus", () => {
            focused = true;
            renderHint();
        });
        window.addEventListener("blur", () => {
            focused = false;
            renderHint();
        });
        // A swipe on the player's own board moves; elsewhere the page scrolls, as it may be taller
        // than the frame with many players
        let touchStart: { x: number; y: number } | undefined;
        root.addEventListener("pointerdown", (event) => {
            const onOwnBoard = (event.target as HTMLElement).closest(".player.mine") !== null;
            touchStart = onOwnBoard ? { x: event.clientX, y: event.clientY } : undefined;
        });
        root.addEventListener("pointerup", (event) => {
            if (touchStart === undefined) return;
            const dx = event.clientX - touchStart.x;
            const dy = event.clientY - touchStart.y;
            touchStart = undefined;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
            void move(
                Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up",
            );
        });
        setInterval(renderClock, 1000);
    },

    isOpen(shared) {
        return (shared as SharedState).phase === "open";
    },

    lobby(shared): Lobby {
        const s = shared as SharedState;
        return {
            blurb: `Everyone gets their own board. The first to make a <strong>${s.target}</strong> tile wins,
                or the top score after <strong>${limitText(s.timeLimit)}</strong>.
                Stuck? Restart on a fresh board and keep racing.`,
            seats: s.seats,
            hint: `Start when everyone has joined. Up to ${s.maxPlayers} can race.`,
            settings: {
                specs: RACE_SETTINGS,
                current: s.settings,
                host: s.host,
                hostName: s.hostName,
            },
        };
    },

    renderLive(body, shared) {
        syncOwn(shared as SharedState);
        renderRace(body, shared as SharedState);
    },

    renderEnd(body, endState) {
        // The end state is the race's final shared state, so it's drawn the same way. Only one
        // version of it has ever been written.
        const shared = endState as Partial<SharedState> | null;
        if (
            shared === null ||
            typeof shared !== "object" ||
            shared.version !== STATE_VERSION ||
            !Array.isArray(shared.players)
        ) {
            return false;
        }
        syncOwn(shared as SharedState);
        renderRace(body, shared as SharedState);
        return true;
    },

    clock() {
        return clockText(current());
    },

    onKey(event) {
        const direction = KEYS[event.key];
        if (direction === undefined || !canMove()) return false;
        void move(direction);
        return true;
    },

    onAction(action, el) {
        switch (action) {
            case "restart":
                void restart();
                break;
            case "move":
                void move(el.dataset.direction as Direction);
                break;
        }
    },
};

/**
 * The race as it is now: the end state once the race is over, which is its final shared state, or
 * the latest shared state, or nothing before the first one
 */
function current(): SharedState | undefined {
    const oc = ctx?.oc;
    return (oc?.endState ?? oc?.state?.shared) as SharedState | undefined;
}

/** Takes the player's board from the shared state, unless a move is still being answered */
function syncOwn(shared: SharedState | undefined) {
    if (ctx === undefined) return;
    const me = shared?.players.find((p) => p.id === ctx!.oc.userId);
    if (me === undefined) {
        own = undefined;
    } else if (!sending && (own === undefined || me.rev >= own.rev)) {
        applyOwn(me);
    }
}

function applyOwn(p: PlayerView) {
    own = { board: p.board, rev: p.rev, score: p.score, best: p.best, dead: p.dead, won: p.won };
}

/** Whether a move can be made now: by a player, in a race that's on, on a board that's alive */
function canMove(): boolean {
    const oc = ctx?.oc;
    if (oc === undefined || oc.role !== "player" || oc.finished) return false;
    const shared = current();
    if (shared === undefined || shared.phase !== "active") return false;
    return own !== undefined && !own.dead && !own.won;
}

async function move(direction: Direction) {
    // Nothing is sent once the race is over: there's no token then anyway
    if (ctx === undefined || !canMove() || own === undefined) return;
    if (sending) {
        queued = direction;
        return;
    }
    const predicted = slide(own.board, direction);
    if (!predicted.moved) return;
    const score = own.score + predicted.gained;
    own = { ...own, board: predicted.board, score, best: Math.max(own.best, score) };
    // Sending from here, before the predicted board is drawn: a render syncs the player's board
    // from the shared state unless a move is being answered, and the prediction has the same
    // `rev` as the state's board, which would put the old board back
    sending = true;
    ownMove = direction;
    ctx.render();
    ownMove = undefined;

    try {
        const response = await ctx.oc.fetch("/api/2048/move", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ direction }),
        });
        const result = (await response.json()) as MoveResponse;
        if (result.ok) {
            applyOwn(result.player);
        } else {
            ctx.notice(result.error);
            sending = false;
            syncOwn(current());
        }
    } catch {
        ctx.notice("Couldn't reach the game");
        sending = false;
        syncOwn(current());
    }
    sending = false;
    ctx.render();
    if (queued !== undefined) {
        const next = queued;
        queued = undefined;
        void move(next);
    }
}

async function restart() {
    if (ctx === undefined || ctx.oc.role !== "player" || ctx.oc.finished || sending) return;
    sending = true;
    try {
        const response = await ctx.oc.fetch("/api/2048/restart", { method: "POST" });
        const result = (await response.json()) as MoveResponse;
        if (result.ok) {
            applyOwn(result.player);
        } else {
            ctx.notice(result.error);
        }
    } catch {
        ctx.notice("Couldn't reach the game");
    }
    sending = false;
    syncOwn(current());
    ctx.render();
}

// Drawing

/** A player's card: its elements, brought up to date on each change, with the board that animates */
type CardDom = {
    el: HTMLElement;
    name: HTMLElement;
    status: HTMLElement;
    stats: HTMLElement;
    view: BoardView;
    overlay: HTMLElement;
};

/** The race view, kept while the same board is the big one */
type RaceDom = {
    root: HTMLElement;
    mainId: string;
    banner: HTMLElement;
    main: CardDom;
    controls: HTMLElement;
    others: HTMLElement;
    otherCards: Map<string, CardDom>;
};

let raceDom: RaceDom | undefined;

function renderRace(body: HTMLElement, shared: SharedState) {
    const oc = ctx?.oc;
    const me = oc?.userId;
    const player = oc?.role === "player";
    // The player's own board is the big one, over the others' in a row, the top score first: a
    // player's best from any of their boards, which is what wins when the time's up. Someone
    // watching sees the leader's board as the big one.
    const byScore = [...shared.players].sort(
        (a, b) => b.best - a.best || b.score - a.score || a.name.localeCompare(b.name),
    );
    const main = byScore.find((p) => p.id === me) ?? byScore[0];
    if (main === undefined) {
        raceDom = undefined;
        body.innerHTML = `<p class="notice">Nobody's racing.</p>`;
        return;
    }
    // Built afresh when the big board changes, or the lobby was shown in between
    if (raceDom === undefined || raceDom.mainId !== main.id || !body.contains(raceDom.root)) {
        raceDom = buildRace(body, main, main.id === me ? own : undefined);
    }
    const dom = raceDom;

    const winner = byScore.find((p) => p.id === shared.winner);
    dom.banner.hidden = shared.phase !== "finished";
    dom.banner.innerHTML = shared.phase === "finished" ? ending(shared, winner, me) : "";

    // The player's own board slides for their move; a board that moved in the shared state
    // slides when the last move was its player's, and the board is that move's
    const lastMove = shared.lastMove;
    const hint = (p: PlayerView): Direction | undefined =>
        p.id === me ? ownMove : lastMove?.player === p.id ? lastMove.direction : undefined;
    updateCard(dom.main, main, main.id === me ? own : undefined, shared, "main", hint(main));

    dom.controls.hidden = !(player && shared.phase === "active" && oc?.finished !== true);
    renderHint();

    const others = byScore.filter((p) => p !== main);
    const seen = new Set<string>();
    for (const p of others) {
        seen.add(p.id);
        let card = dom.otherCards.get(p.id);
        if (card === undefined) {
            card = buildCard(p, undefined, "small");
            dom.otherCards.set(p.id, card);
        }
        updateCard(card, p, undefined, shared, "small", hint(p));
        // Appending in order sorts the row, moving only the cards whose place changed
        if (dom.others.children[seen.size - 1] !== card.el) {
            dom.others.append(card.el);
        }
    }
    for (const [id, card] of dom.otherCards) {
        if (!seen.has(id)) {
            card.el.remove();
            dom.otherCards.delete(id);
        }
    }
    dom.others.hidden = others.length === 0;
}

function buildRace(body: HTMLElement, main: PlayerView, mine: Own | undefined): RaceDom {
    body.innerHTML = `
        <div class="race">
            <div class="banner" hidden></div>
            <section class="main"></section>
            <div class="controls" hidden>
                <div class="dpad">
                    <button data-action="move" data-direction="up" aria-label="Up">↑</button>
                    <button data-action="move" data-direction="left" aria-label="Left">←</button>
                    <button data-action="move" data-direction="down" aria-label="Down">↓</button>
                    <button data-action="move" data-direction="right" aria-label="Right">→</button>
                </div>
                <p class="muted"><span id="hint"></span> <button class="link" data-action="restart">Restart my board</button></p>
            </div>
            <section class="others" hidden></section>
        </div>`;
    const root = body.firstElementChild as HTMLElement;
    const card = buildCard(main, mine, "main");
    root.querySelector(".main")!.append(card.el);
    return {
        root,
        mainId: main.id,
        banner: root.querySelector(".banner") as HTMLElement,
        main: card,
        controls: root.querySelector(".controls") as HTMLElement,
        others: root.querySelector(".others") as HTMLElement,
        otherCards: new Map(),
    };
}

function buildCard(p: PlayerView, mine: Own | undefined, size: "main" | "small"): CardDom {
    const el = document.createElement("article");
    el.className = `player ${size} ${mine !== undefined ? "mine" : ""}`;
    el.innerHTML = `
        <header><span class="name"></span><span class="status"></span></header>
        <div class="stats"></div>`;
    const view = new BoardView(mine?.board ?? p.board);
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.hidden = true;
    overlay.innerHTML = `<p>No moves left</p><button class="primary" data-action="restart">Restart</button>`;
    view.el.append(overlay);
    el.append(view.el);
    return {
        el,
        name: el.querySelector(".name") as HTMLElement,
        status: el.querySelector(".status") as HTMLElement,
        stats: el.querySelector(".stats") as HTMLElement,
        view,
        overlay,
    };
}

function updateCard(
    card: CardDom,
    p: PlayerView,
    mine: Own | undefined,
    shared: SharedState,
    size: "main" | "small",
    hint: Direction | undefined,
) {
    const board = mine?.board ?? p.board;
    const score = mine?.score ?? p.score;
    const top = mine?.best ?? p.best;
    const dead = mine?.dead ?? p.dead;
    const won = mine?.won ?? p.won;
    card.name.innerHTML = `${escape(p.name)}${mine !== undefined ? " <em>(you)</em>" : ""}`;
    // Only what's out of the ordinary is marked: the winner, and a board that's stuck
    card.status.innerHTML = won
        ? `<span class="chip winner">Winner</span>`
        : dead
          ? `<span class="chip stuck">Stuck</span>`
          : "";
    // "Top" is the score that ranks a player, from any of their boards; "Current" is this board's
    const restarts = p.restarts > 0 ? ` <span title="Restarts">↻ ${p.restarts}</span>` : "";
    card.stats.innerHTML =
        size === "main"
            ? `<span>Top <strong>${top}</strong></span><span>Current <strong>${score}</strong></span>${restarts}`
            : `<span>Top <strong>${top}</strong></span><span>Current ${score}${restarts}</span>`;
    card.view.update(board, hint);
    card.overlay.hidden = !(mine !== undefined && dead && shared.phase === "active");
}

function hintText(): string {
    // the d-pad is only shown where there's no mouse and keyboard
    const keyboard = matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!keyboard) return "Swipe your board, or tap the arrows.";
    return focused ? "Arrow keys or WASD." : "Click your board to use the keys.";
}

/** Only the hint changes with focus: redrawing the controls would lose the click giving it */
function renderHint() {
    const hint = document.getElementById("hint");
    if (hint !== null) hint.textContent = hintText();
}

/** How the race ended, for the banner */
function ending(
    shared: SharedState,
    winner: PlayerView | undefined,
    me: string | undefined,
): string {
    if (winner === undefined) return "The race is over";
    const who = `<strong>${escape(winner.name)}</strong> ${winner.id === me ? "(you) " : ""}`;
    if (shared.ended === "time") {
        return `Time's up! ${who}wins with the top score, ${winner.best.toLocaleString()}`;
    }
    return `${who}reached ${shared.target} in ${elapsedText(shared)}`;
}

/** The time left while racing, or how long the race took once it's over */
function clockText(shared: SharedState | undefined): string {
    if (shared?.startedAt === undefined) return "";
    if (shared.phase === "finished") return elapsedText(shared);
    if (shared.endsAt === undefined) return elapsedText(shared);
    return `${mmss(shared.endsAt - Date.now())} left`;
}

function elapsedText(shared: SharedState): string {
    if (shared.startedAt === undefined) return "";
    return mmss((shared.finishedAt ?? Date.now()) - shared.startedAt);
}

function mmss(ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

/** eg. "10 minutes", "90 seconds" */
function limitText(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds % 60 === 0) {
        const minutes = seconds / 60;
        return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    }
    return `${seconds} seconds`;
}

function renderClock() {
    const clock = document.getElementById("clock");
    const shared = current();
    if (clock !== null && shared?.phase === "active") {
        clock.textContent = clockText(shared);
    }
}

function escape(text: string): string {
    return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
