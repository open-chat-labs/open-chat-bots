// The maze race's view: the maze, drawn on a canvas from the state's seed (`maze.ts`), with every
// racer's dot, and how far each has to go. A racer moves with the arrow keys or WASD, a swipe on the
// maze, or the arrows under it, held to keep going. Their own dot moves at once, as the page knows
// the walls too, and the move goes to the bot over the live socket (`live.ts`), or over HTTP while
// the socket's reconnecting. Each state the bot sends says which of the racer's moves it's taken,
// so the page puts the rest on top of where the bot has them: if the bot refused one, the dot goes
// back. Everyone else's dots come over the socket as they move, or, for a spectator, who has no
// socket, through OpenChat a few times a second; either way they slide from cell to cell.
//
// Once the race is over, the card's end state is its final state: the maze, where everyone got to,
// and the way out, drawn faintly.
import type { LiveResult } from "../../games/game";
import { duration } from "../../games/duration";
import {
    canMove,
    carve,
    DIRECTIONS,
    DOWN,
    isDirection,
    LEFT,
    RIGHT,
    stepsOut,
    UP,
    wayOut,
    type Direction,
    type Maze,
} from "../../games/maze/maze";
import { MAZE_SETTINGS } from "../../games/maze/settings";
import {
    GAME_ID,
    MAX_PLAYERS,
    STATE_VERSION,
    type MoveMessage,
    type RacerState,
    type SharedState,
} from "../../games/maze/types";
import { racerColour } from "../colours";
import { roomFor } from "../layout";
import { LiveSocket } from "../live";
import { fetchUsernames, nameOf } from "../names";
import { raceClock, raceLobby } from "../race";
import type { GameView, ViewContext } from "../view";

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
/** The fewest milliseconds between moves, so a held key doesn't outrun the bot's limit */
const MOVE_EVERY_MS = 60;
/** How often a held arrow under the maze moves */
const HOLD_EVERY_MS = 130;

type Dom = {
    root: HTMLElement;
    status: HTMLElement;
    canvas: HTMLCanvasElement;
    controls: HTMLElement;
    hint: HTMLElement;
    note: HTMLElement;
    standings: HTMLElement;
};

let ctx: ViewContext | undefined;
let dom: Dom | undefined;
/** The newest state, from the socket or OpenChat, whichever has the higher `rev` */
let latest: SharedState | undefined;
/** How the race ended, once the card has it */
let end: SharedState | undefined;
let endSource: unknown;
/** The maze, carved once for its seed and size */
let carved: { key: string; maze: Maze } | undefined;
/** The racer's moves the bot hasn't taken yet, and the number the next one gets */
const pending: MoveMessage[] = [];
let nextN = 1;
let movedAt = 0;
/** Where each dot's drawn, sliding towards where it is */
const drawnAt = new Map<string, { x: number; y: number }>();
let animating = false;
let focused = document.hasFocus();

// The live socket, while the racer's racing
const socket = new LiveSocket<SharedState>(() => ctx, {
    wanted: () => canRace(),
    state: (shared) => take(shared),
    // Moves made while it was away go again: the bot takes each once
    opened: (send) => {
        for (const m of pending) send(m);
    },
    error: (text) => ctx?.notice(text),
    changed: () => render(),
});

export const mazeView: GameView = {
    id: GAME_ID,
    title: "Maze Race",
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
        setInterval(() => ctx?.render(), 1000);
    },

    isOpen(state) {
        return (state as SharedState).phase === "open";
    },

    lobby(state) {
        const s = state as SharedState;
        const { size, minutes } = s.settings;
        return raceLobby(s, {
            blurb: `Everyone races through the same <strong>${size} by ${size}</strong> maze, from the
                top left to the bottom right, and sees everyone else as they go. The first out wins,
                or whoever's closest when the <strong>${minutes} minute${minutes === 1 ? "" : "s"}</strong>
                are up.`,
            settings: MAZE_SETTINGS,
            maxPlayers: MAX_PLAYERS,
        });
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
            socket.disconnect();
        }
        ensureDom(body);
        render();
        return true;
    },

    clock() {
        return raceClock(shown());
    },

    onKey(event) {
        const direction = KEYS[event.key];
        if (direction === undefined || !canRace()) return false;
        move(direction);
        return true;
    },

    onAction() {
        // The arrows under the maze are held, so they're the view's own pointer handlers
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
        typeof s.seed === "number" &&
        typeof s.size === "number" &&
        Array.isArray(s.racers)
        ? (s as SharedState)
        : undefined;
}

/** Takes a state from the socket or OpenChat, if it's newer than the one shown */
function take(state: SharedState) {
    if (latest !== undefined && state.rev < latest.rev) return;
    latest = state;
    const mine = myRacer();
    if (mine !== undefined) {
        // The bot's taken these moves, or refused them: either way they're done with
        while (pending.length > 0 && pending[0].n <= mine.ack) pending.shift();
        nextN = Math.max(nextN, mine.ack + 1);
    }
    if (state.phase === "finished") socket.disconnect();
}

function mazeOf(s: SharedState): Maze | undefined {
    if (s.seed === undefined) return undefined;
    const key = `${s.size}:${s.seed}`;
    if (carved?.key !== key) carved = { key, maze: carve(s.size, s.seed) };
    return carved.maze;
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

/** Where the racer is: where the bot has them, and the moves it hasn't taken yet on top */
function myCell(maze: Maze, racer: RacerState): { x: number; y: number } {
    let { x, y } = racer;
    for (const { move: direction } of pending) {
        if (!canMove(maze, x, y, direction)) continue;
        x += DIRECTIONS[direction].dx;
        y += DIRECTIONS[direction].dy;
    }
    return { x, y };
}

function move(direction: Direction) {
    const s = latest;
    const racer = myRacer();
    if (!canRace() || s === undefined || racer === undefined) return;
    const maze = mazeOf(s);
    if (maze === undefined) return;
    const now = Date.now();
    if (now - movedAt < MOVE_EVERY_MS) return;
    const { x, y } = myCell(maze, racer);
    if (!canMove(maze, x, y, direction)) return;
    movedAt = now;
    const message: MoveMessage = { move: direction, n: nextN++ };
    pending.push(message);
    send(message);
    render();
}

function send(message: MoveMessage) {
    if (socket.send(message)) return;
    // No socket just now: the same move over HTTP, which answers the new state
    void (async () => {
        try {
            const response = await ctx!.oc.fetch("/api/maze/move", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(message),
            });
            const result = (await response.json()) as
                | { ok: true; shared: SharedState }
                | Extract<LiveResult, { ok: false }>;
            if (result.ok) take(result.shared);
            render();
        } catch {
            // The next state puts the dot where the bot has it
        }
    })();
}

function ensureDom(body: HTMLElement) {
    if (dom !== undefined && body.contains(dom.root)) return;
    body.innerHTML = `
        <div class="maze">
            <p class="maze-status"></p>
            <canvas class="maze-board" aria-label="The maze"></canvas>
            <div class="controls" hidden>
                <div class="dpad">
                    <button data-direction="up" aria-label="Up">↑</button>
                    <button data-direction="left" aria-label="Left">←</button>
                    <button data-direction="down" aria-label="Down">↓</button>
                    <button data-direction="right" aria-label="Right">→</button>
                </div>
                <p class="muted small"><span class="hint"></span> <span class="note"></span></p>
            </div>
            <ol class="race-standings maze-standings"></ol>
        </div>`;
    const root = body.firstElementChild as HTMLElement;
    const q = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
    dom = {
        root,
        status: q(".maze-status"),
        canvas: q(".maze-board"),
        controls: q(".controls"),
        hint: q(".hint"),
        note: q(".note"),
        standings: q(".maze-standings"),
    };
    // A held arrow keeps moving, until it's let go
    let held: ReturnType<typeof setInterval> | undefined;
    const release = () => {
        clearInterval(held);
        held = undefined;
    };
    for (const button of root.querySelectorAll<HTMLElement>(".dpad button")) {
        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            const direction = button.dataset.direction;
            if (!isDirection(direction)) return;
            release();
            move(direction);
            held = setInterval(() => move(direction), HOLD_EVERY_MS);
        });
    }
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    // A swipe on the maze moves a cell
    let swipe: { x: number; y: number } | undefined;
    dom.canvas.addEventListener("pointerdown", (event) => {
        swipe = { x: event.clientX, y: event.clientY };
    });
    dom.canvas.addEventListener("pointerup", (event) => {
        if (swipe === undefined) return;
        const dx = event.clientX - swipe.x;
        const dy = event.clientY - swipe.y;
        swipe = undefined;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
        move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    });
}

function render() {
    const s = shown();
    if (dom === undefined || s === undefined || ctx === undefined) return;
    if (s.phase !== "open")
        fetchUsernames(
            ctx,
            s.racers.map((r) => r.id),
        );
    const maze = mazeOf(s);
    const racing = canRace();

    if (s.phase === "finished") {
        dom.status.textContent =
            s.winner === undefined
                ? "The race is over"
                : s.ended === "out" && s.startedAt !== undefined && s.finishedAt !== undefined
                  ? `${nameOf(s.winner, s.names)} got out in ${duration(s.finishedAt - s.startedAt)}`
                  : `Time's up! ${nameOf(s.winner, s.names)} got closest to the way out`;
    } else {
        dom.status.textContent = racing
            ? "Find the way out, bottom right"
            : "Watching: the way out is bottom right";
    }

    dom.controls.hidden = !racing;
    dom.note.textContent =
        racing && !socket.live && !socket.unavailable ? "Reconnecting for live updates…" : "";
    renderHint();

    // Everyone, closest to the way out first
    if (maze !== undefined) {
        const colour = new Map(s.racers.map((r, i) => [r.id, racerColour(i)]));
        const rows = s.racers
            .map((r) => ({ r, left: stepsOut(maze, r.x, r.y) }))
            .sort((a, b) => a.left - b.left || a.r.moves - b.r.moves)
            .map(({ r, left }) => {
                const li = document.createElement("li");
                li.classList.toggle("mine", r.id === ctx?.oc.userId);
                const swatch = document.createElement("span");
                swatch.className = "swatch";
                swatch.style.background = colour.get(r.id)!;
                const who = document.createElement("span");
                who.className = "who";
                who.textContent = nameOf(r.id, s.names);
                const steps = document.createElement("span");
                steps.className = "steps";
                steps.textContent = left === 0 ? "Out" : `${left} to go`;
                li.append(swatch, who, steps);
                return li;
            });
        dom.standings.replaceChildren(...rows);
    }
    draw();
}

function renderHint() {
    if (dom === undefined) return;
    const keyboard = matchMedia("(hover: hover) and (pointer: fine)").matches;
    dom.hint.textContent = !keyboard
        ? "Swipe the maze, or hold an arrow."
        : focused
          ? "Arrow keys or WASD."
          : "Click the maze to use the keys.";
}

/** Where each racer is to be drawn: the racer's own dot where the page has it */
function targets(s: SharedState, maze: Maze): Map<string, { x: number; y: number }> {
    const at = new Map<string, { x: number; y: number }>();
    for (const r of s.racers) {
        at.set(r.id, r.id === ctx?.oc.userId && end === undefined ? myCell(maze, r) : r);
    }
    return at;
}

// Draws the maze and the dots, sliding each towards its cell a frame at a time until they're there
function draw() {
    const s = shown();
    if (dom === undefined || s === undefined || !document.body.contains(dom.root)) return;
    const maze = mazeOf(s);
    if (maze === undefined) return;
    fitCanvas();
    const canvas = dom.canvas;
    const size = canvas.clientWidth;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size * ratio)) {
        canvas.width = Math.round(size * ratio);
        canvas.height = Math.round(size * ratio);
    }
    const g = canvas.getContext("2d");
    if (g === null || size === 0) return;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    const style = getComputedStyle(document.documentElement);
    const cell = size / maze.size;
    const n = maze.size;

    g.fillStyle = style.getPropertyValue("--panel").trim() || "#fff";
    g.fillRect(0, 0, size, size);
    // The way out, and the way to it once the race is over
    g.fillStyle = "rgba(47, 163, 107, 0.28)";
    g.fillRect((n - 1) * cell, (n - 1) * cell, cell, cell);
    if (s.phase === "finished") {
        g.strokeStyle = "rgba(47, 163, 107, 0.6)";
        g.lineWidth = Math.max(2, cell * 0.18);
        g.lineJoin = "round";
        g.setLineDash([cell * 0.25, cell * 0.25]);
        g.beginPath();
        let [x, y] = [0, 0];
        g.moveTo(cell / 2, cell / 2);
        for (const d of wayOut(maze)) {
            x += DIRECTIONS[d].dx;
            y += DIRECTIONS[d].dy;
            g.lineTo((x + 0.5) * cell, (y + 0.5) * cell);
        }
        g.stroke();
        g.setLineDash([]);
    }
    // The walls: each cell's top and left, and the right and bottom along the edges
    const wall = style.getPropertyValue("--fg").trim() || "#333";
    g.strokeStyle = wall;
    g.lineWidth = Math.max(1.5, cell * 0.1);
    g.lineCap = "round";
    g.beginPath();
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const open = maze.open[y * n + x];
            const [left, top] = [x * cell, y * cell];
            if ((open & UP) === 0) {
                g.moveTo(left, top);
                g.lineTo(left + cell, top);
            }
            if ((open & LEFT) === 0) {
                g.moveTo(left, top);
                g.lineTo(left, top + cell);
            }
            if (x === n - 1 && (open & RIGHT) === 0) {
                g.moveTo(left + cell, top);
                g.lineTo(left + cell, top + cell);
            }
            if (y === n - 1 && (open & DOWN) === 0) {
                g.moveTo(left, top + cell);
                g.lineTo(left + cell, top + cell);
            }
        }
    }
    g.stroke();

    // The dots, sliding: the racer's own quickly, as it's their own key or finger
    const at = targets(s, maze);
    let moving = false;
    for (const [id, target] of at) {
        const from = drawnAt.get(id) ?? target;
        const speed = id === ctx?.oc.userId ? 0.6 : 0.3;
        const next = {
            x: from.x + (target.x - from.x) * speed,
            y: from.y + (target.y - from.y) * speed,
        };
        if (Math.abs(next.x - target.x) < 0.01 && Math.abs(next.y - target.y) < 0.01) {
            drawnAt.set(id, { ...target });
        } else {
            drawnAt.set(id, next);
            moving = true;
        }
    }
    // Racers in the same cell sit round its middle rather than on each other
    const sharing = new Map<string, string[]>();
    for (const [id, p] of at) {
        const key = `${p.x},${p.y}`;
        sharing.set(key, [...(sharing.get(key) ?? []), id]);
    }
    s.racers.forEach((r, i) => {
        const p = drawnAt.get(r.id)!;
        const target = at.get(r.id)!;
        const group = sharing.get(`${target.x},${target.y}`)!;
        const k = group.indexOf(r.id);
        const spread = group.length > 1 ? cell * 0.2 : 0;
        const angle = (2 * Math.PI * k) / group.length;
        const cx = (p.x + 0.5) * cell + spread * Math.cos(angle);
        const cy = (p.y + 0.5) * cell + spread * Math.sin(angle);
        const mine = r.id === ctx?.oc.userId;
        g.beginPath();
        g.arc(cx, cy, cell * (mine ? 0.34 : 0.28), 0, 2 * Math.PI);
        g.fillStyle = racerColour(i);
        g.fill();
        // The viewer's own dot is a little bigger, and ringed
        if (mine) {
            g.lineWidth = Math.max(1.5, cell * 0.09);
            g.strokeStyle = wall;
            g.stroke();
        }
    });

    if (moving && !animating) {
        animating = true;
        requestAnimationFrame(() => {
            animating = false;
            draw();
        });
    }
}

// The maze is square: as wide as the frame, unless what's around it leaves less height than that
function fitCanvas() {
    if (dom === undefined) return;
    const room = roomFor(dom.root, [dom.canvas]);
    dom.canvas.style.maxWidth = `${Math.max(160, Math.floor(room))}px`;
}
