// The bot's page, which OpenChat shows in a game's card, in a frame at the size the card declares
// (`appSize` in the registry), or full screen. It connects to OpenChat with the SDK's browser
// client and shows whichever game the card is for, by the `game` in the shared state, or in the end
// state once the game's over: the 2048 race (`race2048/view.ts`) or chess (`chess/view.ts`). The
// lobby before a game starts is the page's own, the same for every game, with the game's own blurb.
//
// A game that's over is drawn from its end state, which the card keeps for good, so the views read
// older versions of it too. Only a live state from a newer bot than this page asks for a reload.
import { connectToOpenChat, type MiniAppClient } from "@open-ic/openchat-botclient-ts/mini_app";
import { chessView } from "./chess/view";
import { raceView } from "./race2048/view";
import type { BaseState, GameView, Lobby, Seat, ViewContext } from "./view";

const VIEWS: readonly GameView[] = [raceView, chessView];

const root = document.getElementById("app") as HTMLElement;

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
    try {
        oc = await connectToOpenChat();
    } catch (err) {
        root.innerHTML = `<p class="notice">Open this game from its card in OpenChat.<br><small>${escape(
            String(err),
        )}</small></p>`;
        return;
    }
    root.innerHTML = `
        <header class="top">
            <h1 id="title">Game</h1>
            <span id="clock" class="clock"></span>
        </header>
        <div id="toast" class="toast" hidden></div>
        <div id="body" class="body"></div>`;
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
        if (!result.ok) showNotice(result.error ?? "The setting wasn't changed");
    } catch {
        showNotice("Couldn't reach the game");
    }
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
    const live = base(oc.state?.shared);
    const current = viewFor(base(endState) ?? live);
    byId("title").textContent = current?.title ?? "Game";
    byId("clock").textContent = current?.clock() ?? "";

    if (endState !== undefined) {
        // How the game ended, from the card, which keeps it for good: shown as far as the view can
        // read it, whatever release of the bot wrote it
        if (current === undefined || !current.renderEnd(body, endState)) {
            const result = (endState as { result?: unknown } | null)?.result;
            body.innerHTML = `<p class="notice">The game is over.${
                typeof result === "string" ? `<br>${escape(result)}` : ""
            }</p>`;
        }
    } else if (oc.finished) {
        // Opened on a finished card: its end state follows, and no one can start anything
        body.innerHTML = `<p class="notice">Loading…</p>`;
    } else if (live === undefined || current === undefined) {
        // Nothing from the bot yet, or a game this page doesn't know, which can only be a newer one
        body.innerHTML = live === undefined ? lobby(undefined) : reloadNotice();
    } else if (live.version !== current.stateVersion) {
        body.innerHTML = reloadNotice();
    } else if (current.isOpen(live)) {
        body.innerHTML = lobby(current.lobby(live));
    } else {
        current.renderLive(body, live);
    }
}

function reloadNotice(): string {
    return `<p class="notice">This game needs a newer page.</p>
        <p class="center"><button class="primary" data-action="reload">Reload</button></p>`;
}

/** The lobby: who's joined, and the Start button for a player. Before the first state, just that. */
function lobby(info: ReturnType<GameView["lobby"]> | undefined): string {
    const player = oc?.role === "player";
    const seats = info?.seats ?? [];
    const names =
        seats.length === 0
            ? `<p class="muted">Nobody has joined yet.</p>`
            : `<ul class="seats">${seats
                  .map((s) => `<li>${escape(s.name)}${s.id === oc?.userId ? " <em>(you)</em>" : ""}</li>`)
                  .join("")}</ul>`;
    const action = player
        ? `<p class="center"><button class="primary" data-action="start" ${starting ? "disabled" : ""}>
               ${starting ? "Starting…" : "Start the game"}</button></p>
           <p class="muted center">${info?.hint ?? "Start when everyone has joined."}</p>`
        : `<p class="muted center">Join from the card in the chat to play. Watching starts when a player does.</p>`;
    return `<section class="lobby">
        <h2>Waiting to start</h2>
        ${info === undefined ? "" : `<p class="muted">${info.blurb}</p>`}
        ${info?.settings === undefined ? "" : settingsForm(info.settings, info.seats, player)}
        ${names}
        ${action}
    </section>`;
}

/** The host's form for the game's settings; everyone else sees who can change them */
function settingsForm(settings: NonNullable<Lobby["settings"]>, seats: Seat[], player: boolean) {
    const { specs, current, host, hostName } = settings;
    if (host === undefined || host !== oc?.userId || !player) {
        const name = hostName ?? seats.find((s) => s.id === host)?.name;
        const what = specs.map((spec) => spec.label.toLowerCase()).join(" and the ");
        return `<p class="muted small">${name === undefined ? "The host" : escape(name)} can change the ${what}.</p>`;
    }
    const fields = specs.map((spec) => {
        const value = current[spec.id] ?? spec.default;
        // A value set outside the choices, eg. for a test, is shown as it is
        const choices = spec.choices.some((c) => c.value === value)
            ? spec.choices
            : [{ value, label: String(value) }, ...spec.choices];
        const options = choices
            .map((c) => `<option value="${c.value}" ${c.value === value ? "selected" : ""}>${escape(c.label)}</option>`)
            .join("");
        return `<label><span>${escape(spec.label)}</span><select data-setting="${spec.id}">${options}</select></label>`;
    });
    return `<div class="settings">${fields.join("")}</div>`;
}

function escape(text: string): string {
    return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

void main();
