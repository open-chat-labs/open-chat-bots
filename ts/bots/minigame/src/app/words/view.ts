// The Word Race's view: the racer's own guesses, as the bot last answered with them, six rows of
// five letters, each marked once it's guessed: filled when it's in the word in that place, ringed
// when it's in the word elsewhere, faded when it isn't. The racer types with the keyboard under
// them, or their own, which marks each letter as their guesses have. The page doesn't know the
// word, so a guess is marked when the bot answers, which is quick. The guesses also come in the
// racer's private part of each state, so they're there as the page opens. Under them, everyone's
// marks, without their letters, which would give the word away: someone watching sees just those.
//
// Once the race is over, the card's end state is its final state: everyone's guesses and the word,
// and a click on a name shows theirs.
import { closer, guessed, letterMarks } from "../../games/words/marks";
import { describeResult } from "../../games/words/result";
import { WORDS_SETTINGS } from "../../games/words/settings";
import {
    GAME_ID,
    HIT,
    LENGTH,
    MAX_PLAYERS,
    MISS,
    NEAR,
    STATE_VERSION,
    TRIES,
    type GuessResponse,
    type Marks,
    type OwnGuesses,
    type RacerState,
    type SharedState,
} from "../../games/words/types";
import { roomFor } from "../layout";
import { fetchUsernames, nameOf } from "../names";
import { raceClock, raceLobby } from "../race";
import { drawRows, pickable } from "../rows";
import type { GameView, ViewContext } from "../view";

/** How long the page waits to ask for the racer's guesses again after asking failed */
const RETRY_MS = 3000;

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "+zxcvbnm-"];

const BACK_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m11.5 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

type Card = {
    li: HTMLElement;
    who: HTMLElement;
    marks: HTMLElement;
    count: HTMLElement;
    /** The marks the card was last drawn with, none before it's first drawn */
    drawn: string | undefined;
};

type Dom = {
    root: HTMLElement;
    status: HTMLElement;
    grid: HTMLElement;
    /** The grid's rows, a guess each */
    rows: HTMLElement[];
    keys: HTMLElement;
    hint: HTMLElement;
    others: HTMLElement;
    /** The grid's tiles, by row then letter, and what each was last drawn as */
    tiles: HTMLElement[];
    drawn: string[];
    /** The keyboard's letter keys, and what each was last drawn as */
    letterKeys: Map<string, HTMLElement>;
    /** Each racer's card under the grid, kept so a click on one isn't lost to a redraw */
    cards: Map<string, Card>;
};

let ctx: ViewContext | undefined;
let dom: Dom | undefined;
/** The newest state from OpenChat */
let latest: SharedState | undefined;
/** How the race ended, once the card has it */
let end: SharedState | undefined;
let endSource: unknown;
/** The racer's own guesses, as the bot last answered */
let own: OwnGuesses | undefined;
/** What the racer's typed of their next guess */
let typed = "";
/** The racer's guess on its way to the bot, if any */
let sendingGuess: string | undefined;
/** Whether the page is asking the bot for the racer's guesses, which doesn't stop their typing */
let asking = false;
let retryAt = 0;
/** Whose guesses are shown once the race is over */
let picked: string | undefined;

export const wordsView: GameView = {
    id: GAME_ID,
    title: "Word Race",
    stateVersion: STATE_VERSION,

    attach(_root, context) {
        ctx = context;
        window.addEventListener("resize", () => fit(true));
        setInterval(() => ctx?.render(), 1000);
    },

    isOpen(state) {
        return (state as SharedState).phase === "open";
    },

    lobby(state) {
        const s = state as SharedState;
        return raceLobby(s, {
            blurb: `Everyone races to guess the same <strong>${LENGTH} letter</strong> word. Each
                guess's letters are marked: in the word in that place, in the word elsewhere, or not
                in it. First to guess the word wins, or whoever came closest when the
                <strong>${s.settings.minutes} minutes</strong> are up.`,
            settings: WORDS_SETTINGS,
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
        }
        ensureDom(body);
        render();
        return true;
    },

    clock() {
        return raceClock(shown());
    },

    onKey(event) {
        if (!canType() || event.ctrlKey || event.metaKey || event.altKey) return false;
        if (/^[a-z]$/i.test(event.key)) press(event.key.toLowerCase());
        else if (event.key === "Backspace") press("-");
        else if (event.key === "Enter") press("+");
        else return false;
        return true;
    },

    onAction(action, el) {
        if (action === "key" && el.dataset.key !== undefined) {
            press(el.dataset.key);
        } else if (action === "pick") {
            picked = el.dataset.id;
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
        typeof s.word === "string" &&
        Array.isArray(s.racers) &&
        s.racers.every((r) => Array.isArray(r.marks) && Array.isArray(r.guesses))
        ? (s as SharedState)
        : undefined;
}

/**
 * Takes a state from OpenChat, with the racer's guesses from their private part of it, and asks
 * the bot for them if the page's are still behind, eg. as the service hasn't sent them
 */
function take(state: SharedState) {
    latest = state;
    const part = ctx?.oc.state?.private;
    if (isOwn(part)) takeOwn(part);
    if (state.phase === "active" && behind() && Date.now() >= retryAt) void ask();
}

function isOwn(value: unknown): value is OwnGuesses {
    const o = value as Partial<OwnGuesses> | null | undefined;
    return Array.isArray(o?.guesses) && Array.isArray(o.marks);
}

/**
 * Only newer guesses: the bot's answers and the private parts of states can come in any order.
 * What the racer's typed goes once it's among them, eg. a guess the bot took but whose answer
 * was lost.
 */
function takeOwn(guesses: OwnGuesses) {
    if (own !== undefined && guesses.guesses.length <= own.guesses.length) return;
    own = guesses;
    if (own.guesses.includes(typed)) typed = "";
}

/** Whether the racer's last guess was the word, before the state says the race is over */
function won(): boolean {
    return own !== undefined && guessed(own.marks.at(-1) ?? "");
}

/** Whether the racer's guesses on the page are fewer than the state says the bot has */
function behind(): boolean {
    const mine = myRacer();
    return mine !== undefined && (own === undefined || mine.marks.length > own.guesses.length);
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

/**
 * Whether the racer can type a guess: they're racing, with guesses left, they haven't guessed the
 * word, and their last guess isn't on its way still
 */
function canType(): boolean {
    return (
        canRace() &&
        own !== undefined &&
        own.guesses.length < TRIES &&
        !won() &&
        sendingGuess === undefined
    );
}

// A key, on the page's keyboard or the racer's: a letter, "-" to rub one out, or "+" to guess
function press(key: string) {
    if (!canType()) return;
    if (key === "-") {
        typed = typed.slice(0, -1);
    } else if (key === "+") {
        if (typed.length < LENGTH) refuse(`A guess is a word of ${LENGTH} letters`);
        else if (own!.guesses.includes(typed)) refuse("You've guessed that already");
        else void submit(typed);
        return;
    } else if (typed.length < LENGTH && /^[a-z]$/.test(key)) {
        typed += key;
    }
    render();
}

function refuse(error: string) {
    ctx?.notice(error);
    shake();
}

// Shakes the row being typed, as a guess is refused, starting the animation over if it's shaking
function shake() {
    const row = own === undefined ? undefined : dom?.rows[own.guesses.length];
    if (row === undefined) return;
    row.classList.remove("wr-shake");
    void row.offsetWidth;
    row.classList.add("wr-shake");
}

/** Asks the bot for the racer's guesses, eg. as the page opens and the service hasn't sent them */
async function ask() {
    if (asking || !canRace()) return;
    asking = true;
    const result = await request({});
    asking = false;
    if (result?.ok === false) ctx?.notice(result.error);
    render();
}

/**
 * Sends the racer's guess. The bot's answer has their guesses, the new one marked, unless it was
 * refused, when what they typed stays for them to change.
 */
async function submit(guess: string) {
    sendingGuess = guess;
    render();
    const result = await request({ guess });
    sendingGuess = undefined;
    if (result?.ok === true) {
        typed = "";
    } else if (result !== undefined) {
        ctx?.notice(result.error);
        shake();
    }
    render();
}

// A request to the bot, whose answer's guesses the page takes: the answer, or none if it couldn't
// reach the bot. Requests can overlap, as only the newest guesses are kept.
async function request(body: { guess?: string }): Promise<GuessResponse | undefined> {
    if (ctx === undefined) return undefined;
    try {
        const response = await ctx.oc.fetch("/api/words/guess", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        const result = (await response.json()) as GuessResponse;
        if (result.own !== undefined) takeOwn(result.own);
        // No guesses, eg. the game's gone: the page leaves the bot a while before asking again
        else retryAt = Date.now() + RETRY_MS;
        return result;
    } catch {
        ctx.notice("Couldn't reach the game");
        retryAt = Date.now() + RETRY_MS;
        return undefined;
    }
}

function ensureDom(body: HTMLElement) {
    if (dom !== undefined && body.contains(dom.root)) return;
    body.innerHTML = `
        <div class="wr">
            <p class="wr-status"></p>
            <div class="wr-grid" role="grid" aria-label="Guesses"></div>
            <div class="wr-keys"></div>
            <p class="wr-hint muted small"></p>
            <ul class="wr-others"></ul>
        </div>`;
    const root = body.firstElementChild as HTMLElement;
    const q = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
    dom = {
        root,
        status: q(".wr-status"),
        grid: q(".wr-grid"),
        rows: [],
        keys: q(".wr-keys"),
        hint: q(".wr-hint"),
        others: q(".wr-others"),
        tiles: [],
        drawn: [],
        letterKeys: new Map(),
        cards: new Map(),
    };
    // A row a guess, for the grid's roles
    dom.rows = Array.from({ length: TRIES }, () => {
        const row = document.createElement("div");
        row.className = "wr-row";
        row.setAttribute("role", "row");
        for (let i = 0; i < LENGTH; i++) {
            const tile = document.createElement("div");
            tile.setAttribute("role", "gridcell");
            row.append(tile);
            dom!.tiles.push(tile);
        }
        return row;
    });
    dom.drawn = dom.tiles.map(() => "");
    dom.grid.replaceChildren(...dom.rows);
    dom.keys.innerHTML = KEY_ROWS.map(
        (keys) =>
            `<div class="wr-key-row">${[...keys]
                .map((key) =>
                    key === "+"
                        ? `<button type="button" class="wr-key wide" data-action="key" data-key="+">Enter</button>`
                        : key === "-"
                          ? `<button type="button" class="wr-key wide" data-action="key" data-key="-" aria-label="Delete">${BACK_SVG}</button>`
                          : `<button type="button" class="wr-key" data-action="key" data-key="${key}">${key}</button>`,
                )
                .join("")}</div>`,
    ).join("");
    for (const el of dom.keys.querySelectorAll<HTMLElement>("[data-key]")) {
        const key = el.dataset.key!;
        if (/^[a-z]$/.test(key)) dom.letterKeys.set(key, el);
    }
    // A key pressed with the mouse doesn't take the focus, which a Space on the racer's own
    // keyboard would press again
    dom.keys.addEventListener("mousedown", (event) => event.preventDefault());
    fitted = "";
}

/** A racer's closest guess's marks, or none before their first */
function closest(r: RacerState): Marks | undefined {
    return r.marks.reduce<Marks | undefined>(
        (best, marks) => (best === undefined || closer(marks, best) < 0 ? marks : best),
        undefined,
    );
}

/**
 * Everyone, the closest first: the winner, then by their closest guesses, then whoever's made
 * fewer guesses, as the bot gives a tie for the closest to whoever made theirs first
 */
function ranked(s: SharedState): RacerState[] {
    const won = (r: RacerState) => (r.id === s.winner ? 1 : 0);
    return [...s.racers].sort((a, b) => {
        const ca = closest(a);
        const cb = closest(b);
        const close =
            ca === undefined || cb === undefined ? (cb ? 1 : 0) - (ca ? 1 : 0) : closer(ca, cb);
        return won(b) - won(a) || close || a.marks.length - b.marks.length;
    });
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

    // Whose guesses: the racer's own, or once it's over, whoever's picked, or the winner
    let guesses: string[] | undefined;
    let marks: Marks[] = [];
    let whose: string | undefined;
    if (finished) {
        whose =
            s.racers.find((r) => r.id === picked)?.id ?? mine?.id ?? s.winner ?? ranked(s)[0]?.id;
        const racer = s.racers.find((r) => r.id === whose);
        guesses = racer?.guesses ?? [];
        marks = racer?.marks ?? [];
    } else if (racing) {
        whose = me;
        guesses = own?.guesses ?? [];
        marks = own?.marks ?? [];
    }

    const left = TRIES - (own?.guesses.length ?? 0);
    if (finished) {
        const tries = s.racers.find((r) => r.id === s.winner)?.marks.length ?? 0;
        dom.status.textContent = describeResult(s, tries, (id) => nameOf(id, s.names));
    } else if (racing && won()) {
        // Until the state says the race is over, as the bot's answer comes first
        dom.status.textContent = `You guessed ${own!.guesses.at(-1)!.toUpperCase()}!`;
    } else if (racing && own !== undefined && left === 0) {
        dom.status.textContent = "You've had all your guesses";
    } else if (racing) {
        dom.status.textContent = `Guess the word: ${left} guess${left === 1 ? "" : "es"} left`;
    } else {
        dom.status.textContent = "Watching: the letters show when the race is over";
    }

    const showGrid = guesses !== undefined;
    dom.grid.hidden = !showGrid;
    dom.root.classList.toggle("wr-watching", !showGrid);
    if (showGrid) drawGrid(guesses!, marks, racing);
    const typing = racing && own !== undefined && left > 0 && !won();
    dom.keys.hidden = !typing;
    if (typing) drawKeys();
    renderHint(s, racing, finished, whose);
    renderOthers(s, finished, whose);
    fit();
}

function drawGrid(guesses: string[], marks: Marks[], racing: boolean) {
    if (dom === undefined) return;
    // The row being typed, or the guess on its way to the bot
    const next = racing && guesses.length < TRIES ? (sendingGuess ?? typed) : undefined;
    for (let row = 0; row < TRIES; row++) {
        for (let i = 0; i < LENGTH; i++) {
            const tile = dom.tiles[row * LENGTH + i];
            let letter = "";
            let cls = "wr-tile";
            let label = "Empty";
            if (row < guesses.length) {
                letter = guesses[row][i] ?? "";
                const m = marks[row]?.[i] ?? MISS;
                cls += ` wr-m${m}`;
                label = `${letter.toUpperCase()}, ${m === HIT ? "in place" : m === NEAR ? "elsewhere in the word" : "not in the word"}`;
            } else if (row === guesses.length && next !== undefined) {
                letter = next[i] ?? "";
                if (letter !== "") {
                    cls += sendingGuess !== undefined ? " wr-typed wr-sending" : " wr-typed";
                    label = letter.toUpperCase();
                }
            }
            const key = `${cls}|${letter}`;
            if (dom.drawn[row * LENGTH + i] === key) continue;
            dom.drawn[row * LENGTH + i] = key;
            tile.className = cls;
            tile.textContent = letter;
            tile.setAttribute("aria-label", label);
        }
    }
}

/** The keyboard's letters, marked as the racer's guesses have them */
function drawKeys() {
    if (dom === undefined || own === undefined) return;
    const known = letterMarks(own.guesses, own.marks);
    for (const [letter, el] of dom.letterKeys) {
        const m = known.get(letter);
        const cls = `wr-key${m === undefined ? "" : ` wr-m${m}`}`;
        if (el.className !== cls) el.className = cls;
    }
    const disabled = sendingGuess !== undefined;
    for (const el of dom.keys.querySelectorAll<HTMLButtonElement>("button")) {
        if (el.disabled !== disabled) el.disabled = disabled;
    }
}

function renderHint(s: SharedState, racing: boolean, finished: boolean, whose: string | undefined) {
    if (dom === undefined) return;
    if (finished) {
        const theirs =
            whose === ctx?.oc.userId ? "Your guesses" : `${nameOf(whose, s.names)}'s guesses`;
        dom.hint.textContent = s.racers.length > 1 ? `${theirs}. Tap a name for theirs.` : theirs;
    } else if (racing && own === undefined) {
        dom.hint.textContent = "Getting your guesses…";
    } else {
        dom.hint.textContent = "";
    }
    dom.hint.hidden = dom.hint.textContent === "";
}

/** Everyone's marks, without their letters until the race is over */
function renderOthers(s: SharedState, finished: boolean, whose: string | undefined) {
    if (dom === undefined) return;
    const me = ctx?.oc.userId;
    drawRows(dom.others, dom.cards, ranked(s), othersCard, (card, r) => {
        const li = card.li;
        li.classList.toggle("mine", r.id === me);
        li.classList.toggle("picked", finished && r.id === whose);
        li.classList.toggle("winner", finished && r.id === s.winner);
        pickable(li, r.id, finished ? "pick" : undefined);
        const who = nameOf(r.id, s.names);
        if (card.who.textContent !== who) card.who.textContent = who;
        const drawn = r.marks.join(",");
        if (card.drawn !== drawn) {
            card.drawn = drawn;
            card.marks.innerHTML = Array.from(
                { length: TRIES },
                (_, row) =>
                    `<span class="wr-mini-row">${Array.from(
                        { length: LENGTH },
                        (_, i) =>
                            `<span class="wr-mini${r.marks[row] === undefined ? "" : ` wr-m${r.marks[row][i]}`}"></span>`,
                    ).join("")}</span>`,
            ).join("");
        }
        const count =
            finished && r.id === s.winner && s.ended === "guessed"
                ? "Got it"
                : `${r.marks.length}/${TRIES}`;
        if (card.count.textContent !== count) card.count.textContent = count;
        li.setAttribute("aria-label", `${who}: ${r.marks.length} of ${TRIES} guesses`);
    });
}

function othersCard(): Card {
    const li = document.createElement("li");
    const who = document.createElement("span");
    who.className = "who";
    const marks = document.createElement("span");
    marks.className = "wr-minis";
    marks.setAttribute("aria-hidden", "true");
    const count = document.createElement("span");
    count.className = "count";
    li.append(marks, who, count);
    return { li, who, marks, count, drawn: undefined };
}

// The tiles are as big as the frame leaves room for: the grid's six rows, with what's around it.
// They're at most 58px in a card, and bigger in proportion when the column's wider than a card's
// 440px, eg. full screen on a laptop. Measuring lays the page out, so it's done again only when
// what's round the grid has changed, or the frame has.
let fitted = "";

function fit(force = false) {
    if (dom === undefined || dom.grid.hidden || !document.body.contains(dom.root)) return;
    const around = [
        dom.status.textContent,
        dom.keys.hidden,
        dom.hint.textContent,
        dom.cards.size,
    ].join("|");
    if (!force && around === fitted) return;
    fitted = around;
    const gap = 6;
    const byHeight = (roomFor(dom.root, [dom.grid]) - gap * (TRIES - 1)) / TRIES;
    const byWidth = (dom.root.clientWidth - gap * (LENGTH - 1)) / LENGTH;
    const most = Math.max(58, (58 * dom.root.clientWidth) / 440);
    const tile = Math.floor(Math.max(28, Math.min(most, byHeight, byWidth)));
    dom.grid.style.setProperty("--tile", `${tile}px`);
}
