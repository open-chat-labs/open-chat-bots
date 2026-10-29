// The app's side of OpenChat's MiniApp protocol, for the page a bot serves at `/app`, which OpenChat
// opens in a sandboxed frame from the bot's MiniApp card. It runs in the browser, so it imports
// nothing else from the SDK.
//
// The page and OpenChat, the window it's framed in, talk with `postMessage`:
// - the page sends `{ kind: "mini_app_ready" }` once it's listening, to any origin, as it carries
//   nothing secret;
// - OpenChat answers `{ kind: "initialise_mini_app", role, user_id, token, dark_mode, locale }`,
//   where only a player gets a `token`. The page accepts it only from the window it's framed in,
//   and after it takes messages only from, and sends them only to, its origin;
// - OpenChat sends `{ kind: "mini_app_state", seq, shared, private }` with the game's latest state,
//   and each one after it. Only a player gets `private`, their own part;
// - a player's page sends `{ kind: "mini_app_token_request" }` when its token is running out, or
//   its bot refused it with a 401, and OpenChat answers `{ kind: "mini_app_token", token }`;
// - OpenChat sends `{ kind: "set_dark_mode", dark_mode }` when the user's theme changes.
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

/** What the app sends OpenChat */
export type MiniAppToOpenChat = { kind: "mini_app_ready" } | { kind: "mini_app_token_request" };

/** What OpenChat sends the app */
export type OpenChatToMiniApp =
    | {
          kind: "initialise_mini_app";
          role: MiniAppRole;
          user_id: string;
          token?: string;
          dark_mode: boolean;
          locale: string;
      }
    | { kind: "mini_app_token"; token: string }
    | { kind: "mini_app_state"; seq: number; shared: unknown; private?: unknown }
    | { kind: "set_dark_mode"; dark_mode: boolean };

type Initialise = Extract<OpenChatToMiniApp, { kind: "initialise_mini_app" }>;
type StateMessage = Extract<OpenChatToMiniApp, { kind: "mini_app_state" }>;

/** The parts of a `MessageEvent` the client reads */
export type MiniAppMessageEvent = { data: unknown; origin: string; source: unknown };

/** The parts of `window` the client uses */
export interface MiniAppWindow {
    readonly parent: { postMessage(message: MiniAppToOpenChat, targetOrigin: string): void };
    addEventListener(type: "message", listener: (event: MiniAppMessageEvent) => void): void;
    removeEventListener(type: "message", listener: (event: MiniAppMessageEvent) => void): void;
}

export type ConnectOptions = {
    /** How long to wait for OpenChat to initialise the app, or send a new token. 10s by default. */
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
 * and `Private` are the shapes of the bot's state.
 *
 * ```ts
 * const openChat = await connectToOpenChat<Board, Hand>();
 * render(openChat.state);
 * openChat.onStateChange(render);
 *
 * // A player's move, with their token in the `x-oc-jwt` header
 * await openChat.fetch("api/move", { method: "POST", body: JSON.stringify(move) });
 * ```
 */
export function connectToOpenChat<Shared = unknown, Private = unknown>(
    options: ConnectOptions = {},
): Promise<MiniAppClient<Shared, Private>> {
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
export class MiniAppClient<Shared = unknown, Private = unknown> {
    #window: MiniAppWindow;
    #role: MiniAppRole;
    #userId: string;
    #token?: string;
    #state?: MiniAppState<Shared, Private>;
    // The seq of the last state taken, at or below which a state is dropped
    #seq?: number;
    #darkMode: boolean;
    #locale: string;
    #roleListeners = new Listeners<MiniAppRole>();
    #stateListeners = new Listeners<MiniAppState<Shared, Private>>();
    #darkModeListeners = new Listeners<boolean>();
    #tokenRequest?: {
        promise: Promise<string>;
        resolve: (token: string) => void;
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

    /** The game's latest state, or undefined until OpenChat sends one */
    get state(): MiniAppState<Shared, Private> | undefined {
        return this.#state;
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
     * `fetch`, to the bot's server, with a player's token in the `x-oc-jwt` header, or no token for
     * a spectator. If the bot answers a player with a 401, it asks OpenChat for a new token and
     * tries once more, so give it a body it can send twice, eg. a string.
     */
    async fetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
        const send = () => {
            const headers = new Headers(init.headers);
            if (this.#token !== undefined) {
                headers.set(MINI_APP_TOKEN_HEADER, this.#token);
            }
            return (this.#fetch ?? fetch)(input, { ...init, headers });
        };

        const response = await send();
        if (response.status !== 401 || this.#token === undefined) {
            return response;
        }
        await this.refreshToken();
        return send();
    }

    /** Stops listening to OpenChat, and rejects a token request still waiting */
    close(): void {
        this.#closed = true;
        this.#window.removeEventListener("message", this.#onMessage);
        clearTimeout(this.#refreshTimer);
        this.#rejectTokenRequest(new Error("The client is closed"));
        this.#roleListeners.clear();
        this.#stateListeners.clear();
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
                // A new start, eg. as the user joined or left the game: the next state is taken
                // even if it's the one the app has, as its private part will differ
                const roleChanged = message.role !== this.#role;
                this.#role = message.role;
                this.#userId = message.user_id;
                this.#locale = message.locale;
                this.#seq = undefined;
                this.#setToken(message.token);
                if (roleChanged) {
                    this.#roleListeners.notify(message.role);
                }
                this.#setDarkMode(message.dark_mode);
                break;
            }
            case "mini_app_token":
                this.#setToken(message.token);
                break;
            case "mini_app_state":
                // A state can arrive twice, or out of order
                if (this.#seq !== undefined && message.seq <= this.#seq) return;
                this.#seq = message.seq;
                this.#state = {
                    seq: message.seq,
                    shared: message.shared as Shared,
                    private: message.private as Private | undefined,
                };
                this.#stateListeners.notify(this.#state);
                break;
            case "set_dark_mode":
                this.#setDarkMode(message.dark_mode);
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
        const delay = Math.max(
            MIN_REFRESH_DELAY_MS,
            expiry - this.#refreshBeforeExpiryMs - Date.now(),
        );
        this.#refreshTimer = setTimeout(() => {
            this.refreshToken().catch(() => undefined);
        }, delay);
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
            // The theme and language fall back to light and English
            return (message.role === "player" || message.role === "spectator") &&
                typeof message.user_id === "string"
                ? {
                      kind: "initialise_mini_app",
                      role: message.role,
                      user_id: message.user_id,
                      token: typeof message.token === "string" ? message.token : undefined,
                      dark_mode: message.dark_mode === true,
                      locale: typeof message.locale === "string" ? message.locale : "en",
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
        case "set_dark_mode":
            return typeof message.dark_mode === "boolean"
                ? { kind: "set_dark_mode", dark_mode: message.dark_mode }
                : undefined;
        default:
            return undefined;
    }
}
