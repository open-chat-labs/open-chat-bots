// The 2048 race's page, which OpenChat shows in the game's card, in a frame at the size the card
// declares (`appSize` in the registry), or full screen. It connects to OpenChat with the SDK's
// browser client, draws every player's board from the shared state, and sends the player's own
// moves to the bot. A move is applied to the player's board as soon as it's made, with the bot's
// answer confirming it and adding the new tile.
import { connectToOpenChat, type MiniAppClient } from "@open-ic/openchat-botclient-ts/mini_app";
import { slide, type Board, type Direction } from "../games/race2048/engine";
import {
    STATE_VERSION,
    type MoveResponse,
    type PlayerView,
    type SharedState,
} from "../games/race2048/types";

const root = document.getElementById("app") as HTMLElement;

/** The player's own board, as last confirmed by the bot or predicted from a move */
type Own = { board: Board; rev: number; score: number; dead: boolean; won: boolean };

let oc: MiniAppClient<SharedState> | undefined;
let own: Own | undefined;
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
    // Only the hint changes with focus: redrawing everything would lose the click giving it
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
    render();

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

function render() {
    if (oc === undefined) return;
    const shared = oc.state?.shared;
    const player = oc.role === "player";
    let body: string;
    if (shared !== undefined && shared.version !== STATE_VERSION) {
        body = `<p class="notice">This game needs a newer page.</p>
            <p class="center"><button class="primary" data-action="reload">Reload</button></p>`;
    } else if (shared === undefined || shared.phase === "open") {
        body = lobby(shared, player);
    } else {
        body = race(shared, player);
    }
    root.innerHTML = `
        <header class="top">
            <h1>2048 Race</h1>
            <span id="clock" class="clock">${clockText(shared)}</span>
        </header>
        ${notice === undefined ? "" : `<div class="toast">${escape(notice)}</div>`}
        ${body}`;
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
        <p class="muted">Everyone gets their own board. The first to make a <strong>${shared?.target ?? 2048}</strong> tile wins.
           Stuck? Restart on a fresh board and keep racing.</p>
        ${names}
        ${action}
    </section>`;
}

function race(shared: SharedState, player: boolean): string {
    const me = oc?.userId;
    // The player's own board is the big one, over the others' in a row, the highest score first.
    // Someone watching sees the leader's board as the big one.
    const byScore = [...shared.players].sort(
        (a, b) => b.score - a.score || a.name.localeCompare(b.name),
    );
    const main = byScore.find((p) => p.id === me) ?? byScore[0];
    const others = byScore.filter((p) => p !== main);
    const winner = byScore.find((p) => p.id === shared.winner);
    const banner =
        shared.phase === "finished"
            ? `<div class="banner">
                   ${winner === undefined ? "The race is over" : `<strong>${escape(winner.name)}</strong> ${winner.id === me ? "(you) " : ""}reached ${shared.target} in ${clockText(shared)}`}
               </div>`
            : "";
    const big =
        main === undefined ? "" : card(main, main.id === me ? own : undefined, shared, "main");
    const row =
        others.length === 0
            ? ""
            : `<section class="others">${others.map((p) => card(p, undefined, shared, "small")).join("")}</section>`;
    const controls =
        player && shared.phase === "active"
            ? `<div class="controls">
                   <div class="dpad">
                       <button data-action="move" data-direction="up" aria-label="Up">↑</button>
                       <button data-action="move" data-direction="left" aria-label="Left">←</button>
                       <button data-action="move" data-direction="down" aria-label="Down">↓</button>
                       <button data-action="move" data-direction="right" aria-label="Right">→</button>
                   </div>
                   <p class="muted"><span id="hint">${hintText()}</span> <button class="link" data-action="restart">Restart my board</button></p>
               </div>`
            : "";
    // The controls are under the player's board, so the d-pad is near it, with the row last
    return `${banner}<section class="main">${big}</section>${controls}${row}`;
}

function hintText(): string {
    // the d-pad is only shown where there's no mouse and keyboard
    const keyboard = matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!keyboard) return "Swipe your board, or tap the arrows.";
    return focused ? "Arrow keys or WASD." : "Click your board to use the keys.";
}

function renderHint() {
    const hint = document.getElementById("hint");
    if (hint !== null) hint.textContent = hintText();
}

function card(p: PlayerView, mine: Own | undefined, shared: SharedState, size: "main" | "small"): string {
    const board = mine?.board ?? p.board;
    const score = mine?.score ?? p.score;
    const dead = mine?.dead ?? p.dead;
    const won = mine?.won ?? p.won;
    // The big board that isn't the viewer's own is the leader's
    const leading = size === "main" && mine === undefined;
    const status = won
        ? `<span class="chip winner">Winner</span>`
        : dead
          ? `<span class="chip stuck">Stuck</span>`
          : shared.phase === "finished"
            ? ""
            : leading
              ? `<span class="chip racing">Leading</span>`
              : `<span class="chip racing">Racing</span>`;
    const overlay =
        mine !== undefined && dead && shared.phase === "active"
            ? `<div class="overlay"><p>No moves left</p><button class="primary" data-action="restart">Restart</button></div>`
            : "";
    return `<article class="player ${size} ${mine !== undefined ? "mine" : ""}">
        <header>
            <span class="name">${escape(p.name)}${mine !== undefined ? " <em>(you)</em>" : ""}</span>
            ${status}
        </header>
        <div class="stats">
            ${
                size === "main"
                    ? `<span>Score <strong>${score}</strong></span>
                       <span>Best <strong>${Math.max(...board, 0)}</strong></span>`
                    : `<span><strong>${score}</strong></span>
                       <span>best ${Math.max(...board, 0)}</span>`
            }
            ${p.restarts > 0 ? `<span title="Restarts">↻ ${p.restarts}</span>` : ""}
        </div>
        <div class="board">
            ${board.map((v) => `<div class="tile ${v === 0 ? "" : `t-${v > 2048 ? "big" : v}`}">${v === 0 ? "" : v}</div>`).join("")}
            ${overlay}
        </div>
    </article>`;
}

function clockText(shared: SharedState | undefined): string {
    if (shared?.startedAt === undefined) return "";
    const end = shared.finishedAt ?? Date.now();
    const seconds = Math.max(0, Math.floor((end - shared.startedAt) / 1000));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
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
