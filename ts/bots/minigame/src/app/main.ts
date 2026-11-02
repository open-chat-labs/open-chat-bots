// The bot's page, which OpenChat shows in a game's card, in a frame at the size the card declares
// (`appSize` in the registry), or full screen. It connects to OpenChat with the SDK's browser
// client and shows whichever game the card is for, by the `game` in the shared state, or in the end
// state once the game's over: the 2048 race (`race2048/view.ts`), chess (`chess/view.ts`), Four in
// a Row (`fourinarow/view.ts`), Reversi (`reversi/view.ts`), the maze race (`maze/view.ts`),
// ChatMan (`chatman/view.ts`) or the Minesweeper race (`minesweeper/view.ts`). The lobby before a
// game starts is the page's own, the same for every game, with the game's own blurb.
//
// A game that's over is drawn from its end state, which the card keeps for good, so the views read
// older versions of it too. A live state is read only at the view's own version. One this page
// can't read can only be from a newer bot, so it asks for a reload: that's a newer version, a game
// it doesn't know, or anything but an object with a `version` and a `game`, which leaves a later
// release free to change the encoding. One from an older bot is about to be replaced, as the bot
// publishes every unfinished game when it starts, so the page waits for that.
import { connectToOpenChat, type MiniAppClient } from "@open-ic/openchat-botclient-ts/mini_app";
import { chatmanView } from "./chatman/view";
import { chessView } from "./chess/view";
import { fourInARowView } from "./fourinarow/view";
import { mazeView } from "./maze/view";
import { minesweeperView } from "./minesweeper/view";
import { raceView } from "./race2048/view";
import { reversiView } from "./reversi/view";
import type { BaseState, GameView, Lobby, Seat, ViewContext } from "./view";

const VIEWS: readonly GameView[] = [
    raceView,
    chessView,
    fourInARowView,
    reversiView,
    mazeView,
    chatmanView,
    minesweeperView,
];

const root = document.getElementById("app") as HTMLElement;

// What the page shows until there's a game to: the same as index.html's, which is up before this
// script runs. Until then the page is just the spinner, so what the frame first shows isn't a
// placeholder for the game, eg. an empty lobby before the first state comes.
const SPINNER = `<div class="loading" role="status" aria-label="Loading the game"><span class="spinner"></span></div>`;

let oc: MiniAppClient<unknown, unknown, unknown> | undefined;
/** The game's view, once the page knows which game the card is for */
let view: GameView | undefined;
let notice: string | undefined;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let starting = false;

const ctx: ViewContext = {
    get oc() {
        return oc!;
    },
    notice: showNotice,
    render,
};

async function main() {
    // The page is in the user's theme already, from index.html's script, which reads OpenChat's
    // `oc_theme` from the URL before the page is drawn
    try {
        oc = await connectToOpenChat();
    } catch (err) {
        root.innerHTML = `<p class="notice">Open this game from its card in OpenChat.<br><small>${escape(
            String(err),
        )}</small></p>`;
        return;
    }
    root.innerHTML = `
        <header id="top" class="top" hidden>
            <h1 id="title">Game</h1>
            <span id="clock" class="clock"></span>
        </header>
        <div id="toast" class="toast" hidden></div>
        <div id="body" class="body">${SPINNER}</div>`;
    applyTheme(oc.darkMode);
    oc.onDarkModeChange(applyTheme);
    oc.onStateChange(render);
    oc.onRoleChange(render);
    oc.onEndState(render);

    // The keys are the view's, eg. the arrows, which only it may keep from scrolling the page
    window.addEventListener("keydown", (event) => {
        if (view?.onKey(event) === true) event.preventDefault();
    });
    // The host's settings form in the lobby
    root.addEventListener("change", (event) => {
        const select = event.target as HTMLSelectElement;
        if (select.dataset.setting === undefined) return;
        void configure(select.dataset.setting, Number(select.value));
    });
    root.addEventListener("click", (event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
        if (button === null) return;
        const action = button.dataset.action!;
        switch (action) {
            case "start":
                void start();
                break;
            case "reload":
                location.reload();
                break;
            default:
                view?.onAction(action, button);
        }
    });

    render();
}

/** The state's `version` and `game`, if it has them */
function base(state: unknown): BaseState | undefined {
    if (state === null || typeof state !== "object") return undefined;
    const s = state as Record<string, unknown>;
    return typeof s.version === "number" && typeof s.game === "string"
        ? (s as unknown as BaseState)
        : undefined;
}

/** The view for the game named in the state, attached the first time it's known */
function viewFor(state: BaseState | undefined): GameView | undefined {
    if (view !== undefined || state === undefined) return view;
    view = VIEWS.find((v) => v.id === state.game);
    if (view !== undefined) {
        view.attach(root, ctx);
        document.title = view.title;
    }
    return view;
}

async function start() {
    if (oc === undefined || oc.role !== "player" || oc.finished || starting) return;
    starting = true;
    render();
    try {
        const { accepted, message } = await oc.start();
        if (!accepted) showNotice(message ?? "The game couldn't start");
    } catch (err) {
        showNotice(String(err));
    }
    starting = false;
    render();
}

/** The host's change to a setting, which comes back to everyone in the next state */
async function configure(id: string, value: number) {
    if (oc === undefined || oc.role !== "player") return;
    try {
        const response = await oc.fetch("/api/settings", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ [id]: value }),
        });
        const result = (await response.json()) as { ok: boolean; error?: string };
        if (!result.ok) {
            undoSetting(id, value);
            showNotice(result.error ?? "The setting wasn't changed");
        }
    } catch {
        undoSetting(id, value);
        showNotice("Couldn't reach the game");
    }
}

/**
 * Puts a setting's dropdown, which shows what the host picked, back to what the game has: the
 * option it was last drawn with selected. Unless the host has picked another value since.
 */
function undoSetting(id: string, value: number) {
    const select = document.querySelector<HTMLSelectElement>(`select[data-setting="${id}"]`);
    if (select === null || select.value !== String(value)) return;
    for (const option of Array.from(select.options)) option.selected = option.defaultSelected;
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
    const theme = dark ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    // The URL says so too, so that a reload, eg. for a newer version, starts in the theme as it is.
    // That's only nice to have, so a browser that won't change the URL is left as it is.
    try {
        history.replaceState(history.state, "", `#oc_theme=${theme}`);
    } catch {
        // eg. too many changes too quickly
    }
}

function byId(id: string): HTMLElement {
    return document.getElementById(id) as HTMLElement;
}

function render() {
    if (oc === undefined) return;
    const toast = byId("toast");
    toast.hidden = notice === undefined;
    toast.textContent = notice ?? "";
    const body = byId("body");

    const endState = oc.endState;
    const state = oc.state;
    const live = base(state?.shared);
    const current = viewFor(base(endState) ?? live);
    byId("title").textContent = current?.title ?? "Game";
    byId("clock").textContent = current?.clock() ?? "";
    // Nothing to show yet but the spinner, without even the header
    let loading = false;

    if (endState !== undefined) {
        // How the game ended, from the card, which keeps it for good: shown as far as the view can
        // read it, whatever release of the bot wrote it
        if (current === undefined || !current.renderEnd(body, endState)) {
            const result = (endState as { result?: unknown } | null)?.result;
            body.innerHTML = `<p class="notice">The game is over.${
                typeof result === "string" ? `<br>${escape(result)}` : ""
            }</p>`;
        }
    } else if (oc.finished || state === undefined) {
        // Opened on a finished card, whose end state follows, or nothing from the bot yet
        loading = true;
    } else if (live === undefined || current === undefined || live.version > current.stateVersion) {
        body.innerHTML = reloadNotice();
    } else if (live.version < current.stateVersion) {
        // From an older bot, which is about to publish the game afresh
        loading = true;
    } else if (current.isOpen(live)) {
        renderLobby(body, current.lobby(live));
    } else {
        current.renderLive(body, live);
    }

    byId("top").hidden = loading;
    // Drawn only if it isn't up already, which would start it spinning afresh
    if (loading && body.querySelector(":scope > .loading") === null) body.innerHTML = SPINNER;
    // OpenChat shows the card's artwork until the page has drawn the game, so the card goes
    // straight from that to the game, without the spinner
    if (!loading) oc.drawn();
}

function reloadNotice(): string {
    return `<p class="notice">This game needs a newer page.</p>
        <p class="center"><button class="primary" data-action="reload">Reload</button></p>`;
}

type LobbyInfo = ReturnType<GameView["lobby"]>;

const LOBBY_PARTS = ["blurb", "settings", "seats", "action"] as const;

/** A setting's dropdown, with its label, in the host's form */
type Field = { id: string; html: string };

/** What each part of the lobby last drew */
const drawn = new WeakMap<Element, string>();

/**
 * The lobby: who's joined, the host's settings, and the Start button for a player. It's drawn in
 * parts, and a part is only replaced when what it shows has changed: the page redraws often, eg.
 * every second for a live game's clock, and replacing a dropdown closes it. The host's form is
 * drawn a setting at a time, so a change to one, which comes back in the state, doesn't close
 * another they've opened since.
 */
function renderLobby(body: HTMLElement, info: LobbyInfo) {
    let section = body.querySelector<HTMLElement>(":scope > section.lobby");
    if (section === null) {
        body.innerHTML = `<section class="lobby">
            <h2>Waiting to start</h2>
            ${LOBBY_PARTS.map((name) => `<div class="part" data-part="${name}"></div>`).join("")}
        </section>`;
        section = body.querySelector<HTMLElement>(":scope > section.lobby")!;
    }
    const parts = lobbyParts(info);
    for (const name of LOBBY_PARTS) {
        const part = section.querySelector<HTMLElement>(`[data-part="${name}"]`)!;
        const content = parts[name];
        if (typeof content === "string") {
            draw(part, content);
        } else {
            draw(
                part,
                `<div class="settings">${content.map((f) => `<label data-field="${f.id}"></label>`).join("")}</div>`,
            );
            for (const field of content) {
                draw(part.querySelector(`[data-field="${field.id}"]`)!, field.html);
            }
        }
    }
}

/** Replaces what's in a part of the lobby, unless it's what's there already */
function draw(part: Element, html: string) {
    if (drawn.get(part) !== html) {
        drawn.set(part, html);
        part.innerHTML = html;
    }
}

function lobbyParts(info: LobbyInfo): Record<(typeof LOBBY_PARTS)[number], string | Field[]> {
    const player = oc?.role === "player";
    const seats = info.seats;
    return {
        blurb: `<p class="muted">${info.blurb}</p>`,
        settings:
            info.settings === undefined ? "" : settingsForm(info.settings, info.seats, player),
        seats:
            seats.length === 0
                ? `<p class="muted">Nobody has joined yet.</p>`
                : `<ul class="seats">${seats
                      .map(
                          (s) =>
                              `<li>${escape(s.name)}${s.id === oc?.userId ? " <em>(you)</em>" : ""}</li>`,
                      )
                      .join("")}</ul>`,
        action: player
            ? `<p class="center"><button class="primary" data-action="start" ${starting ? "disabled" : ""}>
               ${starting ? "Starting…" : "Start the game"}</button></p>
           <p class="muted center">${info.hint}</p>`
            : `<p class="muted center">Join from the card in the chat to play. Watching starts when a player does.</p>`,
    };
}

/** The host's form for the game's settings; everyone else sees who can change them */
function settingsForm(
    settings: NonNullable<Lobby["settings"]>,
    seats: Seat[],
    player: boolean,
): string | Field[] {
    const { specs, current, host, hostName } = settings;
    const what = specs.map((spec) => spec.label.toLowerCase()).join(" and the ");
    if (host !== undefined && host === oc?.userId && !player) {
        // The host before they've joined: only a player's token reaches the bot
        return `<p class="muted small">Join to change the ${what}.</p>`;
    }
    if (host === undefined || host !== oc?.userId) {
        // The name from the seat, looked up as they joined, over the one from the command, which
        // may have been a placeholder if the lookup failed then
        const name = seats.find((s) => s.id === host)?.name ?? hostName;
        return `<p class="muted small">${name === undefined ? "The host" : escape(name)} can change the ${what}.</p>`;
    }
    return specs.map((spec) => {
        const value = current[spec.id] ?? spec.default;
        // A value set outside the choices, eg. for a test, is shown as it is
        const choices = spec.choices.some((c) => c.value === value)
            ? spec.choices
            : [{ value, label: String(value) }, ...spec.choices];
        const options = choices
            .map((c) => `<option value="${c.value}" ${c.value === value ? "selected" : ""}>${escape(c.label)}</option>`)
            .join("");
        return {
            id: spec.id,
            html: `<span>${escape(spec.label)}</span><select data-setting="${spec.id}">${options}</select>`,
        };
    });
}

function escape(text: string): string {
    return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

void main();
