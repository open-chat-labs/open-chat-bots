// The app's side of OpenChat's MiniApp protocol, for the page a bot serves at `/app`, which OpenChat
// opens in a sandboxed frame from the bot's MiniApp card. It runs in the browser, so it imports
// nothing else from the SDK.
//
// The page and OpenChat, the window it's framed in, talk with `postMessage`:
// - the page sends `{ kind: "mini_app_ready" }` once it's listening, to any origin, as it carries
//   nothing secret;
// - OpenChat answers `{ kind: "initialise_mini_app", role, user_id, token, dark_mode, locale,
//   finished }`, where only a player gets a `token`. The page accepts it only from the window it's
//   framed in, and after it takes messages only from, and sends them only to, its origin;
// - OpenChat sends `{ kind: "mini_app_state", seq, shared, private }` with the game's latest state,
//   and each one after it. Only a player gets `private`, their own part;
// - OpenChat sends `initialise_mini_app` again when the user's role changes, eg. as they joined the
//   game, then the latest state again, with the same `seq`, now with or without their own part;
// - when the game is over, and its card holds how it ended, `initialise_mini_app` has `finished`
//   true: there's no token, `role` is "player" if the user was one of the game's players and
//   "spectator" otherwise, and no state follows. Instead OpenChat sends
//   `{ kind: "mini_app_end_state", state }`, the end state the bot ended the game with, as parsed
//   JSON, which the page shows its end view from. OpenChat also sends it to a page that's open as
//   its game finishes and the card gets its end state, and no state comes after it;
// - a player's page sends `{ kind: "mini_app_token_request" }` when its token is running out, or
//   its bot refused it with a 401, and OpenChat answers `{ kind: "mini_app_token", token }`;
// - OpenChat sends `{ kind: "set_dark_mode", dark_mode }` when the user's theme changes;
// - a player's page sends `{ kind: "mini_app_start" }` to ask to start the game, eg. from a Start
//   button, and OpenChat answers `{ kind: "mini_app_start_result", accepted, message }`, once the
//   bot has started the game or refused to.
//
// Nothing here lets the app join or leave a game: only OpenChat's own buttons do.

/** The header a player's app sends its token to its bot's server in */
export const MINI_APP_TOKEN_HEADER = "x-oc-jwt";

/** A player gets their own part of the game's state, and a token; a spectator gets neither */
export type MiniAppRole = "player" | "spectator";

/**
 * A game's state, as its bot published it. `shared` is what everyone sees, and `private` the
 * player's own part, which a spectator doesn't get.
 */
export type MiniAppState<Shared = unknown, Private = unknown> = {
    seq: number;
    shared: Shared;
    private?: Private;
};

/**
 * OpenChat's answer to a player asking to start the game. A refusal's `message` is the bot's, eg.
 * "Needs 2 players", or why OpenChat couldn't start it.
 */
export type MiniAppStartResult = { accepted: boolean; message?: string };

/** What the app sends OpenChat */
export type MiniAppToOpenChat =
    | { kind: "mini_app_ready" }
    | { kind: "mini_app_token_request" }
    | { kind: "mini_app_start" };

/** What OpenChat sends the app */
export type OpenChatToMiniApp =
    | {
          kind: "initialise_mini_app";
          role: MiniAppRole;
          user_id: string;
          token?: string;
          dark_mode: boolean;
          locale: string;
          // Whether the game is over, with how it ended in its card: then there's no token, and
          // `mini_app_end_state` follows in place of any state
          finished: boolean;
      }
    | { kind: "mini_app_token"; token: string }
    | { kind: "mini_app_state"; seq: number; shared: unknown; private?: unknown }
    // The end state the bot ended the game with, as parsed JSON
    | { kind: "mini_app_end_state"; state: unknown }
    | { kind: "set_dark_mode"; dark_mode: boolean }
    | ({ kind: "mini_app_start_result" } & MiniAppStartResult);

type Initialise = Extract<OpenChatToMiniApp, { kind: "initialise_mini_app" }>;
type StateMessage = Extract<OpenChatToMiniApp, { kind: "mini_app_state" }>;

/** The parts of a `MessageEvent` the client reads */
export type MiniAppMessageEvent = { data: unknown; origin: string; source: unknown };

/** The parts of `window` the client uses */
export interface MiniAppWindow {
    readonly parent: { postMessage(message: MiniAppToOpenChat, targetOrigin: string): void };
    // The app's own URL, which its requests to the bot are on the origin of
    readonly location: { readonly href: string };
    addEventListener(type: "message", listener: (event: MiniAppMessageEvent) => void): void;
    removeEventListener(type: "message", listener: (event: MiniAppMessageEvent) => void): void;
}

export type ConnectOptions = {
    /** How long to wait for OpenChat to initialise the app, or answer a request. 10s by default. */
    timeoutMs?: number;
    /** How long before a player's token expires to ask for a new one. A minute by default. */
    refreshBeforeExpiryMs?: number;
    /** The window the app runs in, `window` by default */
    window?: MiniAppWindow;
    /** What `MiniAppClient.fetch` calls, the global `fetch` by default */
    fetch?: typeof fetch;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_REFRESH_BEFORE_EXPIRY_MS = 60_000;
// The least time between the token requests the client makes by itself, so that a token which
// looks expired already, eg. as the user's clock is wrong, isn't asked for again and again
const MIN_REFRESH_DELAY_MS = 30_000;

/**
 * Connects the app to OpenChat: tells it the app is ready, and resolves once OpenChat has
 * initialised it. Rejects if the page isn't framed, or OpenChat doesn't answer in time. `Shared`
 * and `Private` are the shapes of the bot's state, and `EndState` of the end state it ends a game
 * with.
 *
 * When the game is over, and its card holds how it ended, the client is `finished` from the start:
 * no state comes, and there's no token, so the app shows its end view from `endState`, which
 * OpenChat sends right after initialising it (`onEndState`). A game that finishes while the app is
 * open gets its end state the same way, and no state after it.
 *
 * ```ts
 * const openChat = await connectToOpenChat<Board, Hand, Replay>();
 * render(openChat.state);
 * openChat.onStateChange(render);
 * openChat.onEndState(renderReplay);
 *
 * // A player's move, with their token in the `x-oc-jwt` header
 * await openChat.fetch("api/move", { method: "POST", body: JSON.stringify(move) });
 * ```
 */
export function connectToOpenChat<Shared = unknown, Private = unknown, EndState = unknown>(
    options: ConnectOptions = {},
): Promise<MiniAppClient<Shared, Private, EndState>> {
    const win = options.window ?? (globalThis as unknown as { window?: MiniAppWindow }).window;
    if (win === undefined) {
        return Promise.reject(new Error("connectToOpenChat runs in the app's page, in a browser"));
    }
    if ((win.parent as unknown) === win) {
        return Promise.reject(new Error("The app isn't in a frame, so OpenChat didn't open it"));
    }

    return new Promise((resolve, reject) => {
        // A state sent before OpenChat initialised the app, which it shouldn't, kept rather than
        // lost
        let early: { state: StateMessage; origin: string } | undefined;

        const timer = setTimeout(() => {
            win.removeEventListener("message", listener);
            reject(new Error("OpenChat didn't initialise the app"));
        }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

        const listener = (event: MiniAppMessageEvent) => {
            if (event.source !== win.parent) return;
            const message = openChatMessage(event.data);
            if (message?.kind === "mini_app_state") {
                early = { state: message, origin: event.origin };
            }
            if (message?.kind !== "initialise_mini_app") return;

            clearTimeout(timer);
            win.removeEventListener("message", listener);
            const state = early?.origin === event.origin ? early.state : undefined;
            resolve(new MiniAppClient(win, event.origin, message, options, state));
        };

        win.addEventListener("message", listener);
        win.parent.postMessage({ kind: "mini_app_ready" }, "*");
    });
}

/** The app's connection to OpenChat, from `connectToOpenChat` */
export class MiniAppClient<Shared = unknown, Private = unknown, EndState = unknown> {
    #window: MiniAppWindow;
    #role: MiniAppRole;
    #userId: string;
    #token?: string;
    #state?: MiniAppState<Shared, Private>;
    // The seq of the last state taken, below which a state is dropped
    #seq?: number;
    #finished: boolean;
    #endState?: EndState;
    #darkMode: boolean;
    #locale: string;
    #roleListeners = new Listeners<MiniAppRole>();
    #stateListeners = new Listeners<MiniAppState<Shared, Private>>();
    #endStateListeners = new Listeners<EndState>();
    #darkModeListeners = new Listeners<boolean>();
    #tokenRequest?: {
        promise: Promise<string>;
        resolve: (token: string) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
    };
    #startRequest?: {
        promise: Promise<MiniAppStartResult>;
        resolve: (result: MiniAppStartResult) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
    };
    #refreshTimer?: ReturnType<typeof setTimeout>;
    #closed = false;
    #timeoutMs: number;
    #refreshBeforeExpiryMs: number;
    #fetch?: typeof fetch;

    constructor(
        window: MiniAppWindow,
        /** OpenChat's origin, which the app takes messages from and sends them to */
        public readonly openChatOrigin: string,
        initialise: Initialise,
        options: ConnectOptions = {},
        state?: StateMessage,
    ) {
        this.#window = window;
        this.#role = initialise.role;
        this.#userId = initialise.user_id;
        this.#finished = initialise.finished;
        this.#darkMode = initialise.dark_mode;
        this.#locale = initialise.locale;
        this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.#refreshBeforeExpiryMs =
            options.refreshBeforeExpiryMs ?? DEFAULT_REFRESH_BEFORE_EXPIRY_MS;
        this.#fetch = options.fetch;
        this.#setToken(initialise.token);
        if (state !== undefined) {
            this.#receive(state);
        }
        window.addEventListener("message", this.#onMessage);
    }

    /** Whether the user is playing the game, or watching it */
    get role(): MiniAppRole {
        return this.#role;
    }

    /** The user's OpenChat user id */
    get userId(): string {
        return this.#userId;
    }

    /**
     * A player's token, for the bot's server, which verifies it, or undefined for a spectator. The
     * client asks OpenChat for a new one shortly before it expires.
     */
    get token(): string | undefined {
        return this.#token;
    }

    /**
     * The game's latest state, or undefined until OpenChat sends one. A game that was over when the
     * app opened gets none: see `endState`.
     */
    get state(): MiniAppState<Shared, Private> | undefined {
        return this.#state;
    }

    /**
     * Whether the game is over, with how it ended in its card. Then there's no token, `role` is
     * "player" if the user was one of the game's players, and no state comes: the app shows its end
     * view from `endState`.
     */
    get finished(): boolean {
        return this.#finished;
    }

    /**
     * How the game ended, as the bot's end state, or undefined until OpenChat sends it: right after
     * initialising an app opened on a finished game, or as the game finishes while the app is open.
     */
    get endState(): EndState | undefined {
        return this.#endState;
    }

    /** Whether the user has OpenChat's dark theme on */
    get darkMode(): boolean {
        return this.#darkMode;
    }

    /** The user's language in OpenChat, eg. "en" */
    get locale(): string {
        return this.#locale;
    }

    /**
     * Calls `callback` when the user's role changes, as OpenChat initialises the app again, eg.
     * after they joined the game. Returns a function which stops it.
     */
    onRoleChange(callback: (role: MiniAppRole) => void): () => void {
        return this.#roleListeners.add(callback);
    }

    /** Calls `callback` with each new state. Returns a function which stops it. */
    onStateChange(callback: (state: MiniAppState<Shared, Private>) => void): () => void {
        return this.#stateListeners.add(callback);
    }

    /**
     * Calls `callback` with the game's end state when OpenChat sends it, by when the client is
     * `finished`. Returns a function which stops it.
     */
    onEndState(callback: (state: EndState) => void): () => void {
        return this.#endStateListeners.add(callback);
    }

    /** Calls `callback` whenever the user's theme changes. Returns a function which stops it. */
    onDarkModeChange(callback: (darkMode: boolean) => void): () => void {
        return this.#darkModeListeners.add(callback);
    }

    /**
     * Asks OpenChat for a new player token, eg. as the bot's server refused the current one with a
     * 401, resolving with it once OpenChat sends it. Requests made while one is waiting share it.
     * Rejects for a spectator, who has no token, or if OpenChat doesn't answer in time.
     */
    refreshToken(): Promise<string> {
        if (this.#closed) {
            return Promise.reject(new Error("The client is closed"));
        }
        if (this.#finished) {
            return Promise.reject(new Error("The game is over"));
        }
        if (this.#token === undefined) {
            return Promise.reject(new Error("Only a player has a token"));
        }
        if (this.#tokenRequest === undefined) {
            let resolve!: (token: string) => void;
            let reject!: (error: Error) => void;
            const promise = new Promise<string>((res, rej) => {
                resolve = res;
                reject = rej;
            });
            const timer = setTimeout(() => {
                this.#tokenRequest = undefined;
                reject(new Error("OpenChat didn't send a new token"));
            }, this.#timeoutMs);
            this.#tokenRequest = { promise, resolve, reject, timer };
            this.#post({ kind: "mini_app_token_request" });
        }
        return this.#tokenRequest.promise;
    }

    /**
     * Asks OpenChat to start the game, eg. as the player pressed the app's Start button. OpenChat
     * asks the bot, which starts the game, with the players it chooses, or refuses. Resolves with
     * the answer, or a refusal if OpenChat doesn't answer in time. A start made while one is
     * waiting shares it. Rejects for a spectator.
     */
    start(): Promise<MiniAppStartResult> {
        if (this.#closed) {
            return Promise.reject(new Error("The client is closed"));
        }
        if (this.#finished) {
            return Promise.resolve({ accepted: false, message: "The game is over" });
        }
        if (this.#role !== "player") {
            return Promise.reject(new Error("Only a player can start the game"));
        }
        if (this.#startRequest === undefined) {
            let resolve!: (result: MiniAppStartResult) => void;
            let reject!: (error: Error) => void;
            const promise = new Promise<MiniAppStartResult>((res, rej) => {
                resolve = res;
                reject = rej;
            });
            const timer = setTimeout(() => {
                this.#startRequest = undefined;
                resolve({ accepted: false, message: "OpenChat didn't answer" });
            }, this.#timeoutMs);
            this.#startRequest = { promise, resolve, reject, timer };
            this.#post({ kind: "mini_app_start" });
        }
        return this.#startRequest.promise;
    }

    /**
     * `fetch`, with a player's token in the `x-oc-jwt` header for a request to the bot's server, on
     * the app's own origin, eg. "api/move". A spectator has no token, and nothing elsewhere, eg. an
     * avatar's URL, gets it. If the bot answers a player with a 401, it asks OpenChat for a new
     * token and tries once more, so give it a body it can send twice, eg. a string.
     */
    async fetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
        const toBot = this.#isAppOrigin(input);
        const send = () => {
            const headers = new Headers(init.headers);
            if (toBot && this.#token !== undefined) {
                headers.set(MINI_APP_TOKEN_HEADER, this.#token);
            }
            return (this.#fetch ?? fetch)(input, { ...init, headers });
        };

        const response = await send();
        if (response.status !== 401 || !toBot || this.#token === undefined) {
            return response;
        }
        await this.refreshToken();
        return send();
    }

    /** Stops listening to OpenChat, and rejects a token request or a start still waiting */
    close(): void {
        this.#closed = true;
        this.#window.removeEventListener("message", this.#onMessage);
        clearTimeout(this.#refreshTimer);
        this.#rejectTokenRequest(new Error("The client is closed"));
        if (this.#startRequest !== undefined) {
            clearTimeout(this.#startRequest.timer);
            this.#startRequest.reject(new Error("The client is closed"));
            this.#startRequest = undefined;
        }
        this.#roleListeners.clear();
        this.#stateListeners.clear();
        this.#endStateListeners.clear();
        this.#darkModeListeners.clear();
    }

    #onMessage = (event: MiniAppMessageEvent) => {
        if (event.source !== this.#window.parent || event.origin !== this.openChatOrigin) return;
        const message = openChatMessage(event.data);
        if (message !== undefined) {
            this.#receive(message);
        }
    };

    #receive(message: OpenChatToMiniApp) {
        switch (message.kind) {
            case "initialise_mini_app": {
                // Again, as the user's role changed, eg. as they joined the game
                const roleChanged = message.role !== this.#role;
                this.#role = message.role;
                this.#userId = message.user_id;
                this.#locale = message.locale;
                if (message.finished) {
                    this.#finished = true;
                }
                this.#setToken(message.token);
                if (roleChanged) {
                    this.#roleListeners.notify(message.role);
                }
                // A spectator doesn't keep the part of the state they had as a player
                if (message.role === "spectator" && this.#state?.private !== undefined) {
                    this.#state = { ...this.#state, private: undefined };
                    this.#stateListeners.notify(this.#state);
                }
                this.#setDarkMode(message.dark_mode);
                break;
            }
            case "mini_app_token":
                this.#setToken(message.token);
                break;
            case "mini_app_state":
                // A state can arrive out of order. One with the same seq replaces the current one,
                // as OpenChat sends the latest again when the user's role changes, with or without
                // their own part.
                if (this.#seq !== undefined && message.seq < this.#seq) return;
                this.#seq = message.seq;
                this.#state = {
                    seq: message.seq,
                    shared: message.shared as Shared,
                    private: message.private as Private | undefined,
                };
                this.#stateListeners.notify(this.#state);
                break;
            case "mini_app_end_state":
                // The game is over, so no state comes after this, and a player's token is no
                // longer any use: OpenChat answers no more token requests or starts
                this.#finished = true;
                this.#setToken(undefined);
                this.#endState = message.state as EndState;
                this.#endStateListeners.notify(this.#endState);
                break;
            case "set_dark_mode":
                this.#setDarkMode(message.dark_mode);
                break;
            case "mini_app_start_result":
                if (this.#startRequest !== undefined) {
                    clearTimeout(this.#startRequest.timer);
                    this.#startRequest.resolve({
                        accepted: message.accepted,
                        message: message.message,
                    });
                    this.#startRequest = undefined;
                }
                break;
        }
    }

    #setToken(token: string | undefined) {
        this.#token = token;
        this.#scheduleRefresh();
        if (token === undefined) {
            this.#rejectTokenRequest(new Error("Only a player has a token"));
        } else if (this.#tokenRequest !== undefined) {
            clearTimeout(this.#tokenRequest.timer);
            this.#tokenRequest.resolve(token);
            this.#tokenRequest = undefined;
        }
    }

    #rejectTokenRequest(error: Error) {
        if (this.#tokenRequest !== undefined) {
            clearTimeout(this.#tokenRequest.timer);
            this.#tokenRequest.reject(error);
            this.#tokenRequest = undefined;
        }
    }

    #setDarkMode(darkMode: boolean) {
        if (darkMode === this.#darkMode) return;
        this.#darkMode = darkMode;
        this.#darkModeListeners.notify(darkMode);
    }

    #scheduleRefresh() {
        clearTimeout(this.#refreshTimer);
        const expiry = this.#token === undefined ? undefined : tokenExpiry(this.#token);
        if (expiry === undefined) return;
        this.#refreshIn(
            Math.max(MIN_REFRESH_DELAY_MS, expiry - this.#refreshBeforeExpiryMs - Date.now()),
        );
    }

    #refreshIn(delay: number) {
        this.#refreshTimer = setTimeout(() => {
            this.refreshToken().catch(() => {
                // OpenChat didn't answer, so ask again a little later, while the user's a player
                if (!this.#closed && this.#token !== undefined) {
                    this.#refreshIn(MIN_REFRESH_DELAY_MS);
                }
            });
        }, delay);
    }

    // Whether a request is to the app's own origin, and so to the bot's server
    #isAppOrigin(input: string | URL): boolean {
        try {
            const app = new URL(this.#window.location.href);
            return new URL(input, app).origin === app.origin;
        } catch {
            return false;
        }
    }

    #post(message: MiniAppToOpenChat) {
        this.#window.parent.postMessage(message, this.openChatOrigin);
    }
}

/**
 * When a token expires, in ms, from its `exp` claim, or undefined if it can't be read. The app reads
 * it only to know when to ask for a new token: the bot's server is what verifies it.
 */
export function tokenExpiry(token: string): number | undefined {
    try {
        const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const claims = JSON.parse(atob(payload));
        return typeof claims.exp === "number" ? claims.exp * 1000 : undefined;
    } catch {
        return undefined;
    }
}

class Listeners<T> {
    #callbacks = new Set<(value: T) => void>();

    add(callback: (value: T) => void): () => void {
        this.#callbacks.add(callback);
        return () => this.#callbacks.delete(callback);
    }

    notify(value: T) {
        for (const callback of this.#callbacks) {
            callback(value);
        }
    }

    clear() {
        this.#callbacks.clear();
    }
}

// The message, if it's one of OpenChat's with the fields its kind needs
function openChatMessage(data: unknown): OpenChatToMiniApp | undefined {
    if (typeof data !== "object" || data === null) return undefined;
    const message = data as Record<string, unknown>;
    switch (message.kind) {
        case "initialise_mini_app":
            // The theme and language fall back to light and English, and a game is live unless
            // OpenChat says it's finished
            return (message.role === "player" || message.role === "spectator") &&
                typeof message.user_id === "string"
                ? {
                      kind: "initialise_mini_app",
                      role: message.role,
                      user_id: message.user_id,
                      token: typeof message.token === "string" ? message.token : undefined,
                      dark_mode: message.dark_mode === true,
                      locale: typeof message.locale === "string" ? message.locale : "en",
                      finished: message.finished === true,
                  }
                : undefined;
        case "mini_app_token":
            return typeof message.token === "string"
                ? { kind: "mini_app_token", token: message.token }
                : undefined;
        case "mini_app_state":
            return typeof message.seq === "number"
                ? {
                      kind: "mini_app_state",
                      seq: message.seq,
                      shared: message.shared,
                      private: message.private ?? undefined,
                  }
                : undefined;
        case "mini_app_end_state":
            // Any JSON value, null included, but it must be there
            return "state" in message
                ? { kind: "mini_app_end_state", state: message.state }
                : undefined;
        case "set_dark_mode":
            return typeof message.dark_mode === "boolean"
                ? { kind: "set_dark_mode", dark_mode: message.dark_mode }
                : undefined;
        case "mini_app_start_result":
            return typeof message.accepted === "boolean"
                ? {
                      kind: "mini_app_start_result",
                      accepted: message.accepted,
                      message: typeof message.message === "string" ? message.message : undefined,
                  }
                : undefined;
        default:
            return undefined;
    }
}
