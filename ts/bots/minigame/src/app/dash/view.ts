// The Dash Race's view: the course on a canvas, scrolling along with the racer's runner, and how
// far everyone's got under it. The runner runs by itself, and a press on the course, or Space or
// the up arrow, jumps, higher the longer it's held. The page plays the racer's presses as they
// make them, a tick at a time on the race's clock (`games/dash/runner.ts`), and sends the bot
// their run as it goes, whole: the bot plays it too, and answers with the run it has, and its
// clock, which the page keeps to. As the page opens, it asks the bot for both. Everyone else is
// drawn faintly where the state says they've got furthest. Someone watching sees the course, and
// everyone on it the same way.
//
// Once the race is over, the card's end state is its final state: how far everyone got, which a
// click on a name shows on the course, and the winner's run, which the page can play through.
import {
    buildCourse,
    GROUND_ROWS,
    percentOf,
    ROWS,
    SOLID,
    SPIKE_DOWN,
    SPIKE_UP,
    TILE,
    tileAt,
    type Course,
} from "../../games/dash/course";
import { describeResult, fallsText, runTime } from "../../games/dash/result";
import {
    FALL_TICKS,
    HEIGHT,
    isChanges,
    runTo,
    startRunner,
    TICKS_PER_SECOND,
    WIDTH,
    type Runner,
} from "../../games/dash/runner";
import { DASH_SETTINGS } from "../../games/dash/settings";
import {
    GAME_ID,
    MAX_CHANGES,
    MAX_PLAYERS,
    STATE_VERSION,
    type OwnRun,
    type RacerState,
    type RunResponse,
    type SharedState,
} from "../../games/dash/types";
import { racerColour } from "../colours";
import { roomFor } from "../layout";
import { fetchUsernames, nameOf } from "../names";
import { raceClock, raceLobby } from "../race";
import { drawRows, pickable } from "../rows";
import type { GameView, ViewContext } from "../view";

/** How many tiles across the canvas shows, and how far from its left side the runner is */
const VIEW_COLUMNS = 12;
const RUNNER_AT = 3;
/** How often the page sends the bot the racer's run while they're running */
const SEND_EVERY_MS = 1000;
/** How long the page waits to ask again after asking failed */
const RETRY_MS = 3000;

const JUMP_KEYS = new Set([" ", "ArrowUp", "w", "W"]);

const LEVEL_NAMES: Readonly<Record<number, string>> = {
    1: "an easy",
    2: "a medium",
    3: "a hard",
};

type Row = {
    li: HTMLElement;
    swatch: HTMLElement;
    who: HTMLElement;
    count: HTMLElement;
};

type Dom = {
    root: HTMLElement;
    status: HTMLElement;
    wrap: HTMLElement;
    canvas: HTMLCanvasElement;
    banner: HTMLElement;
    track: HTMLElement;
    dots: Map<string, HTMLElement>;
    flags: HTMLElement[];
    bar: HTMLElement;
    count: HTMLElement;
    watch: HTMLButtonElement;
    hint: HTMLElement;
    standings: HTMLElement;
    rows: Map<string, Row>;
};

/** A runner as it's played on: its run, where it is, and where it was the tick before */
type Play = { changes: number[]; runner: Runner; prev: Runner };

let ctx: ViewContext | undefined;
let dom: Dom | undefined;
/** The newest state from OpenChat */
let latest: SharedState | undefined;
/** How the race ended, once the card has it */
let end: SharedState | undefined;
let endSource: unknown;
/** The course, built from the sections it was built from */
let built: { key: string; course: Course | undefined } | undefined;
/** The racer's own run, once the page has it */
let mine: Play | undefined;
/** How far the bot's clock is ahead of the page's, at least, once the bot has said */
let offset: number | undefined;
/** The tick the bot has the racer's run to, and how many changes it has */
let confirmed = { upTo: -1, changes: 0 };
let sending = false;
let asked = false;
let retryAt = 0;
let sentAt = 0;
/** The button: the pointers down on the course, and whether a key is */
const pointers = new Set<number>();
let keyDown = false;
let down = false;
/** Whose run is shown once the race is over */
let picked: string | undefined;
/**
 * The winner's run being played through: from the page's clock when it started, at the tick it
 * started from, and whether it's still playing, or stays at the end until something else is shown
 */
let watching: (Play & { from: number; first: number; playing: boolean }) | undefined;
let frame: number | undefined;

export const dashView: GameView = {
    id: GAME_ID,
    title: "Dash Race",
    stateVersion: STATE_VERSION,

    attach(_root, context) {
        ctx = context;
        window.addEventListener("resize", () => {
            fit(true);
            draw();
        });
        window.addEventListener("keyup", (event) => {
            if (!JUMP_KEYS.has(event.key)) return;
            keyDown = false;
            if (pointers.size === 0) setButton(false);
        });
        const lift = (event: PointerEvent) => {
            pointers.delete(event.pointerId);
            if (pointers.size === 0 && !keyDown) setButton(false);
        };
        window.addEventListener("pointerup", lift);
        window.addEventListener("pointercancel", lift);
        window.addEventListener("blur", () => {
            pointers.clear();
            keyDown = false;
            setButton(false);
        });
        setInterval(() => ctx?.render(), 1000);
    },

    isOpen(state) {
        return (state as SharedState).phase === "open";
    },

    lobby(state) {
        const s = state as SharedState;
        const { difficulty, minutes } = s.settings;
        return raceLobby(s, {
            blurb: `Everyone runs the same course, <strong>${LEVEL_NAMES[difficulty] ?? "a"}
                one</strong>, each with their own runner, which runs by itself: tap to jump, and
                hold on to jump higher. A spike or a pit sends you back to the last checkpoint. The
                first to the flag wins, or whoever got furthest when the
                <strong>${minutes} minutes</strong> are up.`,
            settings: DASH_SETTINGS,
            maxPlayers: MAX_PLAYERS,
        });
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
            stopWatching();
        }
        ensureDom(body);
        render();
        return true;
    },

    clock() {
        return raceClock(shown());
    },

    onKey(event) {
        if (!JUMP_KEYS.has(event.key) || event.ctrlKey || event.metaKey || event.altKey) {
            return false;
        }
        if (!canRace()) return false;
        keyDown = true;
        if (!event.repeat) setButton(true);
        return true;
    },

    onAction(action, el) {
        if (action === "watch") watch();
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
        Array.isArray(s.sections) &&
        buildCourse(s.sections) !== undefined &&
        Array.isArray(s.racers) &&
        s.racers.every((r) => typeof r.tiles === "number" && typeof r.falls === "number") &&
        (s.changes === undefined || isChanges(s.changes, MAX_CHANGES))
        ? (s as SharedState)
        : undefined;
}

function courseOf(s: SharedState | undefined): Course | undefined {
    if (s?.sections === undefined) return undefined;
    const key = s.sections.join(",");
    if (built?.key !== key) built = { key, course: buildCourse(s.sections) };
    return built.course;
}

/** Takes a state from OpenChat, and asks the bot once for the racer's run, and its clock */
function take(state: SharedState) {
    latest = state;
    if (state.phase !== "active" || myRacer() === undefined) return;
    if (!asked && Date.now() >= retryAt) {
        asked = true;
        void request(false);
    } else if (mine?.runner.mode === "done" && mine.runner.tick > confirmed.upTo) {
        // Across the line, which the bot hasn't heard yet: again, now the page has waited
        void request(true);
    }
    wake();
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
        mine !== undefined &&
        offset !== undefined &&
        mine.runner.mode !== "done"
    );
}

/** The race's tick now, as the bot counts it, as near as the page can tell, and part way through */
function raceTime(): number | undefined {
    const startedAt = latest?.startedAt;
    if (offset === undefined || startedAt === undefined) return undefined;
    return ((Date.now() + offset - startedAt) * TICKS_PER_SECOND) / 1000;
}

/**
 * Takes a run, playing it from the start to its tick, with the button as it is now: down or up
 * from the tick after, if the run has it otherwise
 */
function setRun(own: OwnRun) {
    const course = courseOf(latest);
    if (course === undefined) return;
    const runner = startRunner(course);
    runTo(course, runner, own.changes, own.upTo);
    const changes = [...own.changes];
    if ((changes.length % 2 === 1) !== down) changes.push(Math.max(own.upTo, runner.tick) + 1);
    mine = { changes, runner, prev: { ...runner } };
}

/** Plays a run on to a tick, keeping where it was the tick before, to draw between the two */
function playTo(course: Course, play: Play, to: number) {
    const r = play.runner;
    if (to <= r.tick || r.mode === "done") return;
    if (to - 1 > r.tick) runTo(course, r, play.changes, to - 1);
    play.prev = { ...r };
    runTo(course, r, play.changes, to);
}

/** The racer's runner, played on to now */
function advance() {
    const course = courseOf(latest);
    const time = raceTime();
    if (mine === undefined || course === undefined || time === undefined || !canRace()) return;
    const wasDone = mine.runner.mode === "done";
    playTo(course, mine, Math.floor(time));
    if (!wasDone && mine.runner.mode === "done") {
        // Across the line: the bot's told at once, as the first to tell it wins
        void request(true);
        render();
    } else if (
        mine.runner.tick > confirmed.upTo &&
        (mine.runner.mode !== "ready" || mine.changes.length > confirmed.changes) &&
        Date.now() - sentAt >= SEND_EVERY_MS
    ) {
        void request(true);
    }
}

/** The button going down or up, which the run takes from the next tick */
function setButton(on: boolean) {
    if (on === down) return;
    down = on;
    if (!canRace() || mine === undefined) return;
    advance();
    const changes = mine.changes;
    if ((changes.length % 2 === 1) === on) return;
    const last = changes[changes.length - 1] ?? -1;
    changes.push(Math.max(mine.runner.tick + 1, last + 1));
    render();
}

/**
 * Sends the bot the racer's run, as far as the page has played it, or asks for the one it has. One
 * request goes at a time.
 */
async function request(send: boolean) {
    if (ctx === undefined || sending) return;
    let body: Partial<OwnRun> = {};
    if (send) {
        if (mine === undefined || mine.runner.tick <= confirmed.upTo) return;
        const upTo = mine.runner.tick;
        body = { changes: mine.changes.filter((c) => c <= upTo), upTo };
    }
    if (Date.now() < retryAt) return;
    sending = true;
    sentAt = Date.now();
    try {
        const response = await ctx.oc.fetch("/api/dash/run", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        const result = (await response.json()) as RunResponse;
        // The bot's clock when it answered, which is now at the earliest. The page keeps the
        // nearest, unless the bot refused its run, eg. as ahead of the race, when the page's clock
        // may have changed since: then the page takes this one, rather than be refused again.
        if (typeof result.now === "number") {
            const sample = result.now - Date.now();
            offset = result.ok ? Math.max(offset ?? -Infinity, sample) : sample;
        }
        if (result.own !== undefined) {
            confirmed = { upTo: result.own.upTo, changes: result.own.changes.length };
            // The bot's run if it couldn't take the page's, or as the page opens, unless the
            // racer's pressed since
            const fresh = mine === undefined || mine.changes.length <= result.own.changes.length;
            if (!result.ok || (!send && fresh)) setRun(result.own);
        } else if (!send) {
            asked = false;
            retryAt = Date.now() + RETRY_MS;
        }
        if (!result.ok && result.own !== undefined) ctx.notice(result.error);
    } catch {
        ctx.notice("Couldn't reach the game");
        retryAt = Date.now() + RETRY_MS;
        if (!send) asked = false;
    }
    sending = false;
    render();
    wake();
    // Across the line while the request was on its way, unless the bot couldn't be reached, when
    // `take` sends it once the page has waited
    const done = mine?.runner.mode === "done" && mine.runner.tick > confirmed.upTo;
    if (done && end === undefined && latest?.phase === "active" && Date.now() >= retryAt) {
        void request(true);
    }
}

/** Plays the winner's run through from just before they set off, or stops it playing */
function watch() {
    if (watching?.playing === true) {
        stopWatching();
        render();
        return;
    }
    const s = shown();
    const course = courseOf(s);
    if (s?.changes === undefined || s.changes.length === 0 || course === undefined) return;
    const runner = startRunner(course);
    const first = Math.max(0, s.changes[0] - TICKS_PER_SECOND / 2);
    runTo(course, runner, s.changes, first);
    watching = {
        changes: s.changes,
        runner,
        prev: { ...runner },
        from: Date.now(),
        first,
        playing: true,
    };
    picked = s.winner;
    render();
    wake();
}

function stopWatching() {
    watching = undefined;
}

function ensureDom(body: HTMLElement) {
    if (dom !== undefined && body.contains(dom.root)) return;
    body.innerHTML = `
        <div class="dash">
            <p class="dash-status"></p>
            <div class="dash-wrap">
                <canvas class="dash-course" aria-label="The course"></canvas>
                <div class="dash-banner" hidden></div>
            </div>
            <div class="dash-track" aria-hidden="true"><span class="dash-line"></span></div>
            <div class="dash-bar">
                <span class="dash-count"></span>
                <button type="button" data-action="watch" hidden></button>
            </div>
            <p class="dash-hint muted small"></p>
            <ol class="race-standings dash-standings"></ol>
        </div>`;
    const root = body.firstElementChild as HTMLElement;
    const q = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
    dom = {
        root,
        status: q(".dash-status"),
        wrap: q(".dash-wrap"),
        canvas: q(".dash-course"),
        banner: q(".dash-banner"),
        track: q(".dash-track"),
        dots: new Map(),
        flags: [],
        bar: q(".dash-bar"),
        count: q(".dash-count"),
        watch: q('[data-action="watch"]'),
        hint: q(".dash-hint"),
        standings: q(".dash-standings"),
        rows: new Map(),
    };
    fitted = "";
    dom.wrap.addEventListener("pointerdown", (event) => {
        if (!canRace()) return;
        event.preventDefault();
        pointers.add(event.pointerId);
        setButton(true);
    });
}

/** Everyone, the furthest on first: the winner, then whoever finished first, then furthest */
function ranked(s: SharedState): RacerState[] {
    const won = (r: RacerState) => (r.id === s.winner ? 1 : 0);
    const time = (r: RacerState) => r.finished ?? Infinity;
    return [...s.racers].sort(
        (a, b) => won(b) - won(a) || time(a) - time(b) || b.tiles - a.tiles || a.falls - b.falls,
    );
}

/** A racer as the standings and the course show them: the racer's own from their runner */
function progress(s: SharedState, r: RacerState): RacerState {
    if (r.id !== ctx?.oc.userId || mine === undefined || end !== undefined) return r;
    const runner = mine.runner;
    return {
        id: r.id,
        tiles: Math.max(r.tiles, Math.floor(runner.furthest / TILE)),
        falls: Math.max(r.falls, runner.falls),
        finished: runner.finished ?? r.finished,
    };
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
    const course = courseOf(s);
    const me = ctx.oc.userId;
    const finished = s.phase === "finished";
    const racing = canRace();
    const runner = end === undefined ? mine?.runner : undefined;
    const touch = !matchMedia("(hover: hover) and (pointer: fine)").matches;

    if (finished) {
        const winner = s.racers.find((r) => r.id === s.winner);
        const percent =
            course === undefined || winner === undefined ? 0 : percentOf(course, winner.tiles);
        dom.status.textContent = describeResult(s, winner && { ...winner, percent }, (id) =>
            nameOf(id, s.names),
        );
    } else if (runner?.mode === "done") {
        // Until the state says the race is over, as the page knows first
        dom.status.textContent = `Across the line in ${runTime(runner.finished!)}!`;
    } else if (racing) {
        dom.status.textContent = "Run for the flag!";
    } else if (myRacer() !== undefined && ctx.oc.role === "player") {
        dom.status.textContent = "Getting your runner…";
    } else {
        dom.status.textContent = "Watching: everyone as far as they've got";
    }

    // Over the course: what to press, while the runner waits for it
    let banner = "";
    if (racing && runner?.mode === "ready") {
        const go = touch ? "Tap" : "Press Space";
        banner = runner.falls === 0 ? `${go} to run` : `${go} to go again`;
    } else if (runner?.mode === "done" && !finished) {
        banner = "Finished!";
    }
    dom.banner.hidden = banner === "";
    if (dom.banner.textContent !== banner) dom.banner.textContent = banner;

    const whose = focusId(s);
    renderCount(s);
    dom.watch.hidden = !finished || s.changes === undefined || s.changes.length === 0;
    dom.watch.textContent = watching?.playing === true ? "Stop" : "Watch how";

    if (finished) {
        dom.hint.textContent = s.racers.length > 1 ? "Tap a name to see how far they got." : "";
    } else if (racing) {
        dom.hint.textContent = touch
            ? "Tap the course to jump, and hold on to jump higher."
            : "Space, the up arrow or a click to jump: hold on to jump higher.";
    } else {
        dom.hint.textContent = "";
    }
    dom.hint.hidden = dom.hint.textContent === "";

    renderTrack(s, course);
    renderStandings(s, finished, whose);
    fit();
    draw();
}

/**
 * The line over the standings: the racer's own count, or, once it's over, whoever's picked, or the
 * winner's time as their run plays through
 */
function renderCount(s: SharedState) {
    if (dom === undefined) return;
    const course = courseOf(s);
    const shownRacer = s.racers.find((r) => r.id === focusId(s));
    let text = "";
    if (watching !== undefined) {
        text = `${nameOf(s.winner, s.names)}'s run · ${runTime(Math.max(0, watching.runner.tick))}`;
    } else if (shownRacer !== undefined && course !== undefined) {
        const r = progress(s, shownRacer);
        const where =
            r.finished !== undefined
                ? runTime(r.finished)
                : `${percentOf(course, r.tiles)}% of the way`;
        const who = r.id === ctx?.oc.userId ? "You" : nameOf(r.id, s.names);
        text = `${who}: ${where}, ${fallsText(r.falls)}`;
    }
    if (dom.count.textContent !== text) dom.count.textContent = text;
}

/** Whose runner the course follows: the racer's own, or the leader, or once it's over, the pick */
function focusId(s: SharedState): string | undefined {
    const me = ctx?.oc.userId;
    if (watching !== undefined) return s.winner;
    if (s.phase === "finished") {
        return (
            s.racers.find((r) => r.id === picked)?.id ??
            (s.racers.some((r) => r.id === me) ? me : (s.winner ?? ranked(s)[0]?.id))
        );
    }
    if (mine !== undefined && myRacer() !== undefined) return me;
    return ranked(s)[0]?.id;
}

/** The line under the course: everyone's dot, as far along as they've got, and the checkpoints */
function renderTrack(s: SharedState, course: Course | undefined) {
    if (dom === undefined || course === undefined) return;
    // The start's isn't drawn
    if (dom.flags.length !== course.checkpoints.length - 1) {
        for (const flag of dom.flags) flag.remove();
        dom.flags = course.checkpoints.slice(1).map((column) => {
            const flag = document.createElement("span");
            flag.className = "dash-checkpoint";
            flag.style.left = `${(100 * column) / course.finish}%`;
            dom!.track.append(flag);
            return flag;
        });
    }
    const me = ctx?.oc.userId;
    const seen = new Set<string>();
    s.racers.forEach((racer, i) => {
        const r = progress(s, racer);
        let dot = dom!.dots.get(r.id);
        if (dot === undefined) {
            dot = document.createElement("span");
            dot.className = "dash-dot";
            dom!.dots.set(r.id, dot);
            dom!.track.append(dot);
        }
        dot.style.background = racerColour(i);
        dot.style.left = `${percentOf(course, r.finished !== undefined ? course.finish : r.tiles)}%`;
        dot.classList.toggle("mine", r.id === me);
        seen.add(r.id);
    });
    for (const [id, dot] of dom.dots) {
        if (!seen.has(id)) {
            dot.remove();
            dom.dots.delete(id);
        }
    }
}

function renderStandings(s: SharedState, finished: boolean, whose: string | undefined) {
    if (dom === undefined) return;
    const me = ctx?.oc.userId;
    const course = courseOf(s);
    const colour = new Map(s.racers.map((r, i) => [r.id, racerColour(i)]));
    drawRows(
        dom.standings,
        dom.rows,
        ranked(s).map((r) => progress(s, r)),
        standingsRow,
        (row, r) => {
            const li = row.li;
            li.classList.toggle("mine", r.id === me);
            li.classList.toggle("picked", finished && r.id === whose);
            li.classList.toggle("winner", finished && r.id === s.winner);
            pickable(li, r.id, finished ? "pick" : undefined);
            row.swatch.style.background = colour.get(r.id)!;
            const who = nameOf(r.id, s.names);
            if (row.who.textContent !== who) row.who.textContent = who;
            const where =
                r.finished !== undefined
                    ? runTime(r.finished)
                    : course === undefined
                      ? ""
                      : `${percentOf(course, r.tiles)}%`;
            const text = `${where} · ${r.falls} fall${r.falls === 1 ? "" : "s"}`;
            if (row.count.textContent !== text) row.count.textContent = text;
        },
    );
}

function standingsRow(): Row {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    const who = document.createElement("span");
    who.className = "who";
    const count = document.createElement("span");
    count.className = "count";
    li.append(swatch, who, count);
    return { li, swatch, who, count };
}

/** Draws again on every frame while a runner's moving, as the racer's or the winner's is */
function wake() {
    if (frame === undefined) frame = requestAnimationFrame(loop);
}

function loop() {
    frame = undefined;
    if (dom === undefined || !document.body.contains(dom.root)) return;
    advance();
    const course = courseOf(shown());
    if (watching?.playing === true && course !== undefined) {
        playTo(course, watching, Math.floor(watchTime(watching)));
        // Played through, to the line, or a while after the run's last press, when the button
        // goes back to Watch how
        const last = watching.changes[watching.changes.length - 1];
        if (watching.runner.mode === "done" || watching.runner.tick > last + 3 * TICKS_PER_SECOND) {
            watching.playing = false;
            render();
        } else {
            renderCount(shown()!);
            draw();
        }
    } else {
        draw();
    }
    if (canRace() || watching?.playing === true) frame = requestAnimationFrame(loop);
}

/** The tick the winner's run being played through is at, and part way through */
function watchTime(w: NonNullable<typeof watching>): number {
    return w.first + ((Date.now() - w.from) * TICKS_PER_SECOND) / 1000;
}

/** The page's colours, as the theme has them, read again only when the theme changes */
let palette: { theme: string; colours: Record<string, string> } | undefined;

function colours(): Record<string, string> {
    const theme = document.documentElement.dataset.theme ?? "light";
    if (palette?.theme !== theme) {
        const style = getComputedStyle(document.documentElement);
        const read = (name: string, fallback: string) =>
            style.getPropertyValue(name).trim() || fallback;
        palette = {
            theme,
            colours: {
                sky: read("--panel", "#fff"),
                clouds: read("--border", "#e6e0d4"),
                hills: read("--empty", "#cdc1b4"),
                ground: read("--board", "#bbada0"),
                top: read("--felt", "#2f7d4f"),
                spike: read("--fg", "#3b3630"),
                muted: read("--muted", "#7a7267"),
                accent: read("--accent", "#e8704a"),
            },
        };
    }
    return palette.colours;
}

/**
 * Where a runner stands in a column: on the solid tiles from the bottom up, so under a ceiling
 * rather than on it, or at the ground's height over a pit
 */
function standY(course: Course, column: number): number {
    let row = 0;
    while (row < ROWS && tileAt(course, column, row) === SOLID) row++;
    return (row === 0 ? GROUND_ROWS : row) * TILE;
}

function draw() {
    const s = shown();
    const course = courseOf(s);
    if (dom === undefined || s === undefined || course === undefined || dom.wrap.hidden) return;
    const canvas = dom.canvas;
    const width = canvas.clientWidth;
    if (width === 0) return;
    const height = Math.round((width * ROWS) / VIEW_COLUMNS);
    const ratio = window.devicePixelRatio || 1;
    if (
        canvas.width !== Math.round(width * ratio) ||
        canvas.height !== Math.round(height * ratio)
    ) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
    }
    const g = canvas.getContext("2d");
    if (g === null) return;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    const c = colours();
    const scale = width / (VIEW_COLUMNS * TILE);
    const me = ctx?.oc.userId;
    const colour = new Map(s.racers.map((r, i) => [r.id, racerColour(i)]));

    // The runner the course follows, drawn between its last two ticks, and who that is
    const time = raceTime();
    let play: Play | undefined;
    let between = 1;
    if (watching !== undefined) {
        play = watching;
        if (watching.playing)
            between = Math.min(1, Math.max(0, watchTime(watching) - watching.runner.tick));
    } else if (end === undefined && mine !== undefined && myRacer() !== undefined) {
        play = mine;
        if (time !== undefined) between = Math.min(1, Math.max(0, time - mine.runner.tick));
    }
    const whose = focusId(s);
    let focusX: number;
    let runner: { x: number; y: number; vy: number; r: Runner };
    if (play !== undefined) {
        const { runner: now, prev } = play;
        const smooth = prev.mode === now.mode && now.x >= prev.x && now.x - prev.x <= TILE;
        const t = smooth ? between : 1;
        runner = {
            x: prev.x + (now.x - prev.x) * t,
            y: prev.y + (now.y - prev.y) * t,
            vy: now.vy,
            r: now,
        };
        focusX = runner.x;
    } else {
        // Whoever's followed standing where they got furthest, or past the line
        const focus = s.racers.find((r) => r.id === whose);
        const column = focus?.finished !== undefined ? course.finish + 1 : (focus?.tiles ?? 1);
        const still = startRunner(course);
        still.mode = "done";
        still.x = column * TILE + (TILE - WIDTH) / 2;
        still.y = standY(course, column);
        runner = { x: still.x, y: still.y, vy: 0, r: still };
        focusX = still.x;
    }
    const camX = Math.max(
        0,
        Math.min(focusX - RUNNER_AT * TILE, (course.width - VIEW_COLUMNS) * TILE),
    );
    const px = (x: number) => (x - camX) * scale;
    const py = (y: number) => height - y * scale;
    const tile = TILE * scale;

    g.fillStyle = c.sky;
    g.fillRect(0, 0, width, height);

    // Clouds and hills far off, going by slower the further off they are
    g.save();
    g.globalAlpha = 0.7;
    g.fillStyle = c.clouds;
    scenery(camX, 0.25, 7 * TILE, width / scale, (x, k) => {
        const y = py((7.2 + ((k * 5) % 3) * 0.6) * TILE);
        const w = (1 + ((k * 3) % 4) * 0.25) * tile;
        g.beginPath();
        g.ellipse(x * scale, y, w, w * 0.32, 0, 0, Math.PI * 2);
        g.ellipse(x * scale + w * 0.45, y - w * 0.18, w * 0.55, w * 0.3, 0, 0, Math.PI * 2);
        g.fill();
    });
    g.globalAlpha = 0.35;
    g.fillStyle = c.hills;
    scenery(camX, 0.5, 5 * TILE, width / scale, (x, k) => {
        const rise = (0.8 + ((k * 7) % 5) * 0.2) * tile;
        g.beginPath();
        g.ellipse(x * scale, py(GROUND_ROWS * TILE), 1.8 * tile, rise, 0, Math.PI, 0);
        g.fill();
    });
    g.restore();

    // The tiles in view
    const first = Math.floor(camX / TILE);
    for (let col = first; col <= first + VIEW_COLUMNS + 1; col++) {
        for (let row = 0; row < ROWS; row++) {
            const kind = tileAt(course, col, row);
            const x = px(col * TILE);
            const y = py((row + 1) * TILE);
            if (kind !== SOLID && row < GROUND_ROWS) {
                // Down a pit, out of the light
                g.fillStyle = c.clouds;
                g.fillRect(x, y, tile + 0.5, tile + 0.5);
            }
            if (kind === SOLID) {
                g.fillStyle = c.ground;
                g.fillRect(x, y, tile + 0.5, tile + 0.5);
                if (tileAt(course, col, row + 1) !== SOLID) {
                    g.fillStyle = c.top;
                    g.fillRect(x, y, tile + 0.5, Math.max(2, tile * 0.16));
                }
            } else if (kind === SPIKE_UP || kind === SPIKE_DOWN) {
                g.fillStyle = c.spike;
                g.beginPath();
                const base = kind === SPIKE_UP ? y + tile : y;
                const point = kind === SPIKE_UP ? y + tile * 0.25 : y + tile * 0.75;
                g.moveTo(x + tile * 0.12, base);
                g.lineTo(x + tile * 0.5, point);
                g.lineTo(x + tile * 0.88, base);
                g.closePath();
                g.fill();
            }
        }
    }

    // The checkpoints, coloured once the racer's runner is past them, and the finish line
    const passed = runner?.r.checkpoint ?? -1;
    course.checkpoints.forEach((column, i) => {
        if (i === 0) return;
        drawFlag(
            g,
            px(column * TILE + TILE / 2),
            py(GROUND_ROWS * TILE),
            tile,
            passed >= i ? c.accent : c.muted,
        );
    });
    drawFinish(g, px(course.finish * TILE), py(GROUND_ROWS * TILE), tile, c);

    // Everyone else, faintly, where they've got furthest, named unless another's name is there
    const labelled = [px(runner.x)];
    s.racers.forEach((racer) => {
        const r = progress(s, racer);
        if (r.id === whose) return;
        const column = r.finished !== undefined ? course.finish + 1 : r.tiles;
        const x = px(column * TILE + (TILE - WIDTH) / 2);
        if (x < -tile || x > width + tile) return;
        const y = py(standY(course, column) + HEIGHT);
        g.save();
        g.globalAlpha = 0.5;
        g.strokeStyle = colour.get(r.id)!;
        g.lineWidth = Math.max(1.5, tile * 0.08);
        roundRect(g, x, y, WIDTH * scale, HEIGHT * scale, tile * 0.18);
        g.stroke();
        if (labelled.every((other) => Math.abs(other - x) > tile * 1.6)) {
            labelled.push(x);
            g.fillStyle = c.muted;
            g.font = `${Math.max(9, Math.round(tile * 0.34))}px system-ui, sans-serif`;
            g.textAlign = "center";
            const label = r.id === me ? "You" : nameOf(r.id, s.names);
            const short = label.length > 10 ? `${label.slice(0, 9)}…` : label;
            g.fillText(short, x + (WIDTH * scale) / 2, y - tile * 0.15);
        }
        g.restore();
    });

    drawRunner(g, runner, px, py, scale, colour.get(whose ?? "") ?? c.accent);
}

/**
 * Calls `draw` with where each thing far off is across the view, from the left, and its number,
 * one every `every`, going by at `speed` of the course's
 */
function scenery(
    camX: number,
    speed: number,
    every: number,
    across: number,
    draw: (x: number, k: number) => void,
) {
    const from = camX * speed;
    for (let k = Math.floor(from / every) - 1; k * every < from + across + every; k++) {
        draw(k * every - from, k);
    }
}

function drawRunner(
    g: CanvasRenderingContext2D,
    at: { x: number; y: number; vy: number; r: Runner },
    px: (x: number) => number,
    py: (y: number) => number,
    scale: number,
    fill: string,
) {
    const w = WIDTH * scale;
    const h = HEIGHT * scale;
    const x = px(at.x);
    const y = py(at.y + HEIGHT);
    const r = at.r;
    if (r.mode === "fallen") {
        // Bits flying out from where it fell, fading
        const t = (FALL_TICKS - r.wait) / FALL_TICKS;
        // Down a pit, from its bottom, where it can be seen
        const cy = Math.min(y + h / 2, py(TILE * 0.6));
        g.save();
        g.globalAlpha = Math.max(0, 1 - t);
        g.fillStyle = fill;
        for (let k = 0; k < 8; k++) {
            const angle = (k / 8) * Math.PI * 2 + 0.3;
            const d = t * w * 1.6;
            const size = w * 0.28 * (1 - t * 0.6);
            g.fillRect(
                x + w / 2 + Math.cos(angle) * d - size / 2,
                cy + Math.sin(angle) * d - size / 2,
                size,
                size,
            );
        }
        g.restore();
        return;
    }
    // Waiting, it bobs; running, there are lines behind it; in the air, it leans with its speed
    const bob = r.mode === "ready" ? Math.sin(Date.now() / 220) * h * 0.04 : 0;
    const lean = r.ground ? 0 : Math.max(-0.35, Math.min(0.35, -at.vy / 220));
    g.save();
    if (r.mode === "run" && r.ground) {
        g.strokeStyle = fill;
        g.globalAlpha = 0.35;
        g.lineWidth = Math.max(1, h * 0.07);
        const phase = (r.tick % 6) / 6;
        for (let k = 0; k < 3; k++) {
            const ly = y + h * (0.3 + k * 0.22);
            const lx = x - w * (0.25 + ((k + phase) % 1) * 0.5);
            g.beginPath();
            g.moveTo(lx, ly);
            g.lineTo(lx - w * 0.45, ly);
            g.stroke();
        }
        g.globalAlpha = 1;
    }
    g.translate(x + w / 2, y + h / 2 + bob);
    g.rotate(lean);
    g.fillStyle = fill;
    roundRect(g, -w / 2, -h / 2, w, h, w * 0.28);
    g.fill();
    // Its eye, looking ahead
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(w * 0.16, -h * 0.12, w * 0.19, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1b1a19";
    g.beginPath();
    g.arc(w * 0.23, -h * 0.12, w * 0.09, 0, Math.PI * 2);
    g.fill();
    g.restore();
}

function drawFlag(
    g: CanvasRenderingContext2D,
    x: number,
    ground: number,
    tile: number,
    colour: string,
) {
    g.fillStyle = colour;
    g.fillRect(x - tile * 0.04, ground - tile * 1.7, tile * 0.08, tile * 1.7);
    g.beginPath();
    g.moveTo(x + tile * 0.04, ground - tile * 1.7);
    g.lineTo(x + tile * 0.62, ground - tile * 1.48);
    g.lineTo(x + tile * 0.04, ground - tile * 1.26);
    g.closePath();
    g.fill();
}

/** The finish line: a chequered post, with a chequered flag on it */
function drawFinish(
    g: CanvasRenderingContext2D,
    x: number,
    ground: number,
    tile: number,
    c: Record<string, string>,
) {
    const square = tile * 0.22;
    for (let row = 0; row < 12; row++) {
        for (let col = 0; col < 2; col++) {
            g.fillStyle = (row + col) % 2 === 0 ? c.spike : c.sky;
            g.fillRect(x - square + col * square, ground - (row + 1) * square, square, square);
        }
    }
    const top = ground - 12 * square;
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
            g.fillStyle = (row + col) % 2 === 0 ? c.spike : c.sky;
            g.fillRect(x + square + col * square, top + row * square, square, square);
        }
    }
    g.strokeStyle = c.spike;
    g.lineWidth = 1;
    g.strokeRect(x + square, top, 4 * square, 3 * square);
}

function roundRect(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

// The course is as wide as the frame, unless what's around it leaves less height than that.
// Measuring lays the page out, so it's done again only when what's round the course has changed,
// or the frame has.
let fitted = "";

function fit(force = false) {
    if (dom === undefined || !document.body.contains(dom.root)) return;
    const around = [
        dom.status.textContent,
        dom.hint.textContent,
        dom.bar.hidden,
        dom.rows.size,
    ].join("|");
    if (!force && around === fitted) return;
    fitted = around;
    const room = roomFor(dom.root, [dom.wrap]);
    dom.wrap.style.maxWidth = `${Math.max(200, Math.floor((room * VIEW_COLUMNS) / ROWS))}px`;
}
