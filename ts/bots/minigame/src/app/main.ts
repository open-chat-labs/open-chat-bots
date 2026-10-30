// The 2048 race's page, which OpenChat shows in the game's card, in a frame at the size the card
// declares (`appSize` in the registry), or full screen. It connects to OpenChat with the SDK's
// browser client, draws every player's board from the shared state, and sends the player's own
// moves to the bot. A move is applied to the player's board as soon as it's made, with the bot's
// answer confirming it and adding the new tile.
//
// The lobby is drawn afresh on each change. The race isn't: its boards animate (`board.ts`), so
// their elements are kept and brought up to date, and the rest of the race view with them.
import { connectToOpenChat, type MiniAppClient } from "@open-ic/openchat-botclient-ts/mini_app";
import { slide, type Board, type Direction } from "../games/race2048/engine";
import {
    STATE_VERSION,
    type MoveResponse,
    type PlayerView,
    type SharedState,
} from "../games/race2048/types";
import { BoardView } from "./board";

const root = document.getElementById("app") as HTMLElement;

/** The player's own board, as last confirmed by the bot or predicted from a move */
type Own = { board: Board; rev: number; score: number; dead: boolean; won: boolean };

let oc: MiniAppClient<SharedState> | undefined;
let own: Own | undefined;
/** The direction of the player's own move being drawn, for the board to slide */
let ownMove: Direction | undefined;
let sending = false;
let queued: Direction | undefined;
let notice: string | undefined;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let starting = false;
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

async function main() {
    try {
        oc = await connectToOpenChat<SharedState>();
    } catch (err) {
        root.innerHTML = `<p class="notice">Open this game from its card in OpenChat.<br><small>${escape(
            String(err),
        )}</small></p>`;
        return;
    }
    root.innerHTML = `
        <header class="top">
            <h1>2048 Race</h1>
            <span id="clock" class="clock"></span>
        </header>
        <div id="toast" class="toast" hidden></div>
        <div id="body" class="body"></div>`;
    applyTheme(oc.darkMode);
    oc.onDarkModeChange(applyTheme);
    oc.onStateChange(() => {
        syncOwn();
        render();
    });
    oc.onRoleChange(() => {
        syncOwn();
        render();
    });

    window.addEventListener("keydown", (event) => {
        const direction = KEYS[event.key];
        if (direction === undefined) return;
        event.preventDefault();
        void move(direction);
    });
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
        void move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    });
    root.addEventListener("click", (event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
        if (button === null) return;
        switch (button.dataset.action) {
            case "start":
                void start();
                break;
            case "restart":
                void restart();
                break;
            case "move":
                void move(button.dataset.direction as Direction);
                break;
            case "reload":
                location.reload();
                break;
        }
    });
    setInterval(renderClock, 1000);

    syncOwn();
    render();
}

/** Takes the player's board from the shared state, unless a move is still being answered */
function syncOwn() {
    if (oc === undefined) return;
    const me = oc.state?.shared.players.find((p) => p.id === oc!.userId);
    if (me === undefined) {
        own = undefined;
    } else if (!sending && (own === undefined || me.rev >= own.rev)) {
        applyOwn(me);
    }
}

function applyOwn(p: PlayerView) {
    own = { board: p.board, rev: p.rev, score: p.score, dead: p.dead, won: p.won };
}

async function move(direction: Direction) {
    if (oc === undefined || oc.role !== "player") return;
    const shared = oc.state?.shared;
    if (shared === undefined || shared.phase !== "active") return;
    if (own === undefined || own.dead || own.won) return;
    if (sending) {
        queued = direction;
        return;
    }
    const predicted = slide(own.board, direction);
    if (!predicted.moved) return;
    own = { ...own, board: predicted.board, score: own.score + predicted.gained };
    ownMove = direction;
    render();
    ownMove = undefined;

    sending = true;
    try {
        const response = await oc.fetch("/api/2048/move", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ direction }),
        });
        const result = (await response.json()) as MoveResponse;
        if (result.ok) {
            applyOwn(result.player);
        } else {
            showNotice(result.error);
            sending = false;
            syncOwn();
        }
    } catch {
        showNotice("Couldn't reach the game");
        sending = false;
        syncOwn();
    }
    sending = false;
    render();
    if (queued !== undefined) {
        const next = queued;
        queued = undefined;
        void move(next);
    }
}

async function restart() {
    if (oc === undefined || oc.role !== "player" || sending) return;
    sending = true;
    try {
        const response = await oc.fetch("/api/2048/restart", { method: "POST" });
        const result = (await response.json()) as MoveResponse;
        if (result.ok) {
            applyOwn(result.player);
        } else {
            showNotice(result.error);
        }
    } catch {
        showNotice("Couldn't reach the game");
    }
    sending = false;
    syncOwn();
    render();
}

async function start() {
    if (oc === undefined || oc.role !== "player" || starting) return;
    starting = true;
    render();
    try {
        const { accepted, message } = await oc.start();
        if (!accepted) showNotice(message ?? "The race couldn't start");
    } catch (err) {
        showNotice(String(err));
    }
    starting = false;
    render();
}

function showNotice(text: string) {
    notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
        notice = undefined;
        render();
    }, 4000);
    render();
}

function applyTheme(dark: boolean) {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
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
    mainId: string;
    banner: HTMLElement;
    main: CardDom;
    controls: HTMLElement;
    others: HTMLElement;
    otherCards: Map<string, CardDom>;
};

let raceDom: RaceDom | undefined;

function byId(id: string): HTMLElement {
    return document.getElementById(id) as HTMLElement;
}

function render() {
    if (oc === undefined) return;
    const shared = oc.state?.shared;
    const player = oc.role === "player";
    byId("clock").textContent = clockText(shared);
    const toast = byId("toast");
    toast.hidden = notice === undefined;
    toast.textContent = notice ?? "";
    const body = byId("body");
    if (shared !== undefined && shared.version !== STATE_VERSION) {
        raceDom = undefined;
        body.innerHTML = `<p class="notice">This game needs a newer page.</p>
            <p class="center"><button class="primary" data-action="reload">Reload</button></p>`;
    } else if (shared === undefined || shared.phase === "open") {
        raceDom = undefined;
        body.innerHTML = lobby(shared, player);
    } else {
        renderRace(body, shared, player);
    }
}

function lobby(shared: SharedState | undefined, player: boolean): string {
    const seats = shared?.seats ?? [];
    const names =
        seats.length === 0
            ? `<p class="muted">Nobody has joined yet.</p>`
            : `<ul class="seats">${seats
                  .map((s) => `<li>${escape(s.name)}${s.id === oc?.userId ? " <em>(you)</em>" : ""}</li>`)
                  .join("")}</ul>`;
    const action = player
        ? `<p class="center"><button class="primary" data-action="start" ${starting ? "disabled" : ""}>
               ${starting ? "Starting…" : "Start the race"}</button></p>
           <p class="muted center">Start when everyone has joined. Up to ${shared?.maxPlayers ?? 10} can race.</p>`
        : `<p class="muted center">Join from the card in the chat to race. Watching starts when a player does.</p>`;
    return `<section class="lobby">
        <h2>Waiting to start</h2>
        <p class="muted">Everyone gets their own board. The first to make a <strong>${shared?.target ?? 2048}</strong> tile wins,
           or the top score after <strong>${limitText(shared?.timeLimit ?? 600_000)}</strong>.
           Stuck? Restart on a fresh board and keep racing.</p>
        ${names}
        ${action}
    </section>`;
}

function renderRace(body: HTMLElement, shared: SharedState, player: boolean) {
    const me = oc?.userId;
    // The player's own board is the big one, over the others' in a row, the highest score first.
    // Someone watching sees the leader's board as the big one.
    const byScore = [...shared.players].sort(
        (a, b) => b.score - a.score || a.name.localeCompare(b.name),
    );
    const main = byScore.find((p) => p.id === me) ?? byScore[0];
    if (main === undefined) {
        raceDom = undefined;
        body.innerHTML = `<p class="notice">Nobody's racing.</p>`;
        return;
    }
    if (raceDom === undefined || raceDom.mainId !== main.id) {
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

    dom.controls.hidden = !(player && shared.phase === "active");
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
        <div id="banner" class="banner" hidden></div>
        <section id="main" class="main"></section>
        <div id="controls" class="controls" hidden>
            <div class="dpad">
                <button data-action="move" data-direction="up" aria-label="Up">↑</button>
                <button data-action="move" data-direction="left" aria-label="Left">←</button>
                <button data-action="move" data-direction="down" aria-label="Down">↓</button>
                <button data-action="move" data-direction="right" aria-label="Right">→</button>
            </div>
            <p class="muted"><span id="hint"></span> <button class="link" data-action="restart">Restart my board</button></p>
        </div>
        <section id="others" class="others" hidden></section>`;
    const card = buildCard(main, mine, "main");
    byId("main").append(card.el);
    return {
        mainId: main.id,
        banner: byId("banner"),
        main: card,
        controls: byId("controls"),
        others: byId("others"),
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
    const dead = mine?.dead ?? p.dead;
    const won = mine?.won ?? p.won;
    // The big board that isn't the viewer's own is the leader's
    const leading = size === "main" && mine === undefined;
    card.name.innerHTML = `${escape(p.name)}${mine !== undefined ? " <em>(you)</em>" : ""}`;
    card.status.innerHTML = won
        ? `<span class="chip winner">Winner</span>`
        : dead
          ? `<span class="chip stuck">Stuck</span>`
          : shared.phase === "finished"
            ? ""
            : leading
              ? `<span class="chip racing">Leading</span>`
              : `<span class="chip racing">Racing</span>`;
    const best = Math.max(...board, 0);
    card.stats.innerHTML =
        (size === "main"
            ? `<span>Score <strong>${score}</strong></span><span>Best <strong>${best}</strong></span>`
            : `<span><strong>${score}</strong></span><span>best ${best}</span>`) +
        (p.restarts > 0 ? `<span title="Restarts">↻ ${p.restarts}</span>` : "");
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
function ending(shared: SharedState, winner: PlayerView | undefined, me: string | undefined): string {
    if (winner === undefined) return "The race is over";
    const who = `<strong>${escape(winner.name)}</strong> ${winner.id === me ? "(you) " : ""}`;
    if (shared.ended === "time") {
        return `Time's up! ${who}wins with the top score, ${winner.score.toLocaleString()}`;
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
    const shared = oc?.state?.shared;
    if (clock !== null && shared?.phase === "active") {
        clock.textContent = clockText(shared);
    }
}

function escape(text: string): string {
    return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

void main();
