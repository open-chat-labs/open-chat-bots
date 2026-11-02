// Draws a ChatMan board on a canvas: the maze's walls, the food, the spam bots, speech bubbles with
// eyes, and ChatMan, who's the OpenChat logo, its purple segment his lips, which part as he goes.
// Everything that moves is drawn part of the way to its next tile, by how far into the tick it is,
// so it glides at 20 ticks a second.
import {
    DOOR,
    DOWN,
    DX,
    DY,
    HEIGHT,
    LEFT,
    PELLET,
    tileAt,
    UP,
    WALL,
    WIDTH,
    type ChatMaze,
} from "../../games/chatman/maze";
import {
    CAUGHT_TICKS,
    HOME,
    isCaught,
    isCleared,
    speedOf,
    SUB,
    type Board,
    type Bot,
} from "../../games/chatman/rules";

const FLOOR = "#0f1016";
const WALL_EDGE = "#4b5bd6";
const WALL_FILL = "#1f2550";
const DOOR_COLOUR = "#f08a5d";
const FOOD = "#ffd9a8";
const BOTS = ["#4c8ff0", "#2fa36b", "#f5b82e", "#e8443a"];
const FRIGHTENED = "#8d9bbd";
const PUPIL = "#1b2340";
/** The OpenChat logo's colours, top to bottom: its ring, and the segment that's ChatMan's lips */
const RING = ["#FBB03B", "#F05A24"];
const LIPS = ["#ED1E79", "#5F2583"];
/** The logo's segment spans this far either side of facing right, and its hole is this much of it */
const LIP_DEGREES = 55;
const HOLE = 97.2 / 175;
/** A frightened spam bot flashes for this long before it stops being frightened */
const FLASH_TICKS = 40;

/** The walls, drawn once for each maze and size */
let walls: { maze: ChatMaze; canvas: HTMLCanvasElement } | undefined;

export type DrawOptions = {
    /** How far into the tick it is, from 0 to 1 */
    fraction: number;
    /** A clock in milliseconds, for what pulses and flashes */
    time: number;
};

export function drawBoard(canvas: HTMLCanvasElement, maze: ChatMaze, board: Board, options: DrawOptions) {
    const width = canvas.clientWidth;
    const height = (width * HEIGHT) / WIDTH;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
    }
    const g = canvas.getContext("2d");
    if (g === null || width === 0) return;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    const cell = width / WIDTH;
    g.drawImage(wallsFor(maze, canvas.width, canvas.height), 0, 0, width, height);
    // A cleared maze flashes before the next
    if (isCleared(board) && Math.floor(board.pause / 6) % 2 === 0) {
        g.fillStyle = "rgba(255, 255, 255, 0.18)";
        g.fillRect(0, 0, width, height);
    }

    const pulse = 0.8 + 0.2 * Math.sin(options.time / 160);
    g.fillStyle = FOOD;
    for (const tile of maze.foodTiles) {
        const food = board.food[tile];
        if (food === 0) continue;
        const cx = ((tile % WIDTH) + 0.5) * cell;
        const cy = (Math.floor(tile / WIDTH) + 0.5) * cell;
        if (food === PELLET) {
            g.beginPath();
            g.arc(cx, cy, cell * 0.3 * pulse, 0, 2 * Math.PI);
            g.fill();
        } else {
            const side = Math.max(2, cell * 0.18);
            g.fillRect(cx - side / 2, cy - side / 2, side, side);
        }
    }

    // The spam bots keep out of the way while ChatMan's caught
    if (!isCaught(board)) {
        board.bots.forEach((bot, i) => drawBot(g, board, bot, i, cell, options));
    }
    drawMan(g, board, cell, options.fraction);
}

/** Where an actor's drawn, in tiles: part of the way to the next, while it's moving */
function placed(board: Board, actor: Board["man"] | Bot, fraction: number): { x: number; y: number } {
    const still = board.pause > 0 || board.out;
    const p = Math.min(SUB, actor.p + (still ? 0 : speedOf(board, actor) * fraction));
    return { x: actor.x + (DX[actor.d] * p) / SUB, y: actor.y + (DY[actor.d] * p) / SUB };
}

function drawMan(g: CanvasRenderingContext2D, board: Board, cell: number, fraction: number) {
    const { man } = board;
    const at = placed(board, man, fraction);
    const r = cell * 0.62;
    // His lips part once a tile as he goes, and he comes apart when he's caught
    let mouth: number;
    if (isCaught(board)) {
        mouth = LIP_DEGREES + (180 - LIP_DEGREES) * (1 - board.pause / CAUGHT_TICKS);
    } else if (man.moving && board.pause === 0 && !board.out) {
        const p = Math.min(SUB, man.p + speedOf(board, man) * fraction);
        mouth = LIP_DEGREES * Math.abs(Math.sin((Math.PI * p) / SUB));
    } else {
        mouth = 20;
    }
    g.save();
    g.translate((at.x + 0.5) * cell, (at.y + 0.5) * cell);
    // Facing left he's the logo mirrored, so it keeps its light top
    if (man.d === LEFT) g.scale(-1, 1);
    else if (man.d === UP) g.rotate(-Math.PI / 2);
    else if (man.d === DOWN) g.rotate(Math.PI / 2);
    if (mouth < LIP_DEGREES) {
        ring(g, r, mouth, LIP_DEGREES, LIPS);
        ring(g, r, -LIP_DEGREES, -mouth, LIPS);
    }
    const from = Math.max(mouth, LIP_DEGREES);
    if (from < 180) ring(g, r, from, 360 - from, RING);
    g.restore();
}

/** A stretch of the logo's ring, between two angles clockwise from facing right */
function ring(g: CanvasRenderingContext2D, r: number, from: number, to: number, colours: string[]) {
    const gradient = g.createLinearGradient(0, -r, 0, r);
    gradient.addColorStop(0, colours[0]);
    gradient.addColorStop(1, colours[1]);
    const a = (from * Math.PI) / 180;
    const b = (to * Math.PI) / 180;
    g.beginPath();
    g.arc(0, 0, r, a, b);
    g.arc(0, 0, r * HOLE, b, a, true);
    g.closePath();
    g.fillStyle = gradient;
    g.fill();
}

function drawBot(g: CanvasRenderingContext2D, board: Board, bot: Bot, i: number, cell: number, options: DrawOptions) {
    const at = placed(board, bot, options.fraction);
    const cx = (at.x + 0.5) * cell;
    // Waiting in the pen, they bob
    const cy = (at.y + 0.5) * cell + (bot.mode === HOME ? Math.sin(options.time / 220 + i) * cell * 0.12 : 0);
    const flashing = bot.frightened && board.fright < FLASH_TICKS && Math.floor(options.time / 160) % 2 === 0;
    const fill = bot.frightened ? (flashing ? "#ffffff" : FRIGHTENED) : BOTS[i % BOTS.length];
    const w = cell * 1.05;
    const h = cell * 0.82;
    const left = cx - w / 2;
    const top = cy - h / 2 - cell * 0.08;
    g.fillStyle = fill;
    // Rounded by hand, as older browsers have no `roundRect`
    const k = h * 0.36;
    g.beginPath();
    g.moveTo(left + k, top);
    g.arcTo(left + w, top, left + w, top + h, k);
    g.arcTo(left + w, top + h, left, top + h, k);
    g.arcTo(left, top + h, left, top, k);
    g.arcTo(left, top, left + w, top, k);
    g.closePath();
    g.fill();
    // The speech bubble's tail
    g.beginPath();
    g.moveTo(left + w * 0.18, top + h - 1);
    g.lineTo(left + w * 0.46, top + h - 1);
    g.lineTo(left + w * 0.12, top + h + cell * 0.26);
    g.closePath();
    g.fill();
    // Eyes looking the way it's going, or small and worried while it's frightened
    const er = w * 0.15;
    for (const side of [-1, 1]) {
        const ex = cx + side * w * 0.2;
        const ey = top + h * 0.45;
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.arc(ex, ey, bot.frightened ? er * 0.55 : er, 0, 2 * Math.PI);
        g.fill();
        if (!bot.frightened) {
            g.fillStyle = PUPIL;
            g.beginPath();
            g.arc(ex + DX[bot.d] * er * 0.45, ey + DY[bot.d] * er * 0.45, er * 0.5, 0, 2 * Math.PI);
            g.fill();
        }
    }
}

/**
 * The maze's walls, as merged blocks with an edge along the paths, drawn once into a canvas of
 * their own: each wall tile reaches its neighbouring walls and stops short of the paths
 */
function wallsFor(maze: ChatMaze, width: number, height: number): HTMLCanvasElement {
    if (walls?.maze === maze && walls.canvas.width === width && walls.canvas.height === height) {
        return walls.canvas;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d")!;
    const cell = width / WIDTH;
    g.fillStyle = FLOOR;
    g.fillRect(0, 0, width, height);
    const isWall = (x: number, y: number) => tileAt(maze, x, y) === WALL;
    for (const [inset, colour] of [
        [0.14, WALL_EDGE],
        [0.22, WALL_FILL],
    ] as const) {
        g.fillStyle = colour;
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                if (!isWall(x, y)) continue;
                const l = isWall(x - 1, y) ? 0 : inset * cell;
                const t = isWall(x, y - 1) ? 0 : inset * cell;
                const r = isWall(x + 1, y) ? 0 : inset * cell;
                const b = isWall(x, y + 1) ? 0 : inset * cell;
                g.fillRect(x * cell + l, y * cell + t, cell - l - r, cell - t - b);
            }
        }
    }
    // The pen's door, which only the spam bots go through
    for (let i = 0; i < maze.tiles.length; i++) {
        if (maze.tiles[i] !== DOOR) continue;
        g.fillStyle = DOOR_COLOUR;
        g.fillRect((i % WIDTH) * cell, (Math.floor(i / WIDTH) + 0.42) * cell, cell, cell * 0.16);
    }
    walls = { maze, canvas };
    return canvas;
}

/** The OpenChat logo, small, for a life: its ring and its purple segment */
export function lifeSvg(size: number): string {
    return `<svg class="life" viewBox="0 0 350 350" width="${size}" height="${size}" aria-hidden="true">
        <path fill="${RING[1]}" fill-rule="evenodd" d="M175 0a175 175 0 1 1 0 350a175 175 0 1 1 0-350Zm0 77.8a97.2 97.2 0 1 0 0 194.4a97.2 97.2 0 1 0 0-194.4Z"/>
        <path fill="${LIPS[0]}" d="M275.9 32c44.8 31.7 74.1 83.9 74.1 143s-29.3 111.3-74.1 143l-45.5-63.1c25.3-17.6 41.8-46.8 41.8-79.9s-16.7-62.7-42.2-80.2Z"/>
    </svg>`;
}
