// The app's side of OpenChat's MiniApp protocol, for the page a bot serves at `/app`, which OpenChat
// opens in a frame from the bot's MiniApp card. It runs in the browser, so it imports nothing else
// from the SDK.
//
// The page and OpenChat, the window it's framed in, talk with `postMessage`:
// - the page sends `{ kind: "mini_app_ready" }` once it's listening, to any origin, as it carries
//   nothing secret;
// - OpenChat answers `{ kind: "initialise_mini_app", token, dark_mode, locale }`. The page accepts
//   it only from the window it's framed in, and sends everything after it to that origin only;
// - the page sends `{ kind: "mini_app_token_request" }` when its token is about to expire, or its
//   bot refused it with a 401, and OpenChat answers `{ kind: "mini_app_token", token }`;
// - OpenChat sends `{ kind: "set_dark_mode", dark_mode }` when the user's theme changes.

/** The header the app sends its token to its bot's server in, as OpenChat sends a command's */
export const MINI_APP_TOKEN_HEADER = "x-oc-jwt";

/** What the app sends OpenChat */
export type MiniAppToOpenChat = { kind: "mini_app_ready" } | { kind: "mini_app_token_request" };

/** What OpenChat sends the app */
export type OpenChatToMiniApp =
    | { kind: "initialise_mini_app"; token: string; dark_mode: boolean; locale: string }
    | { kind: "mini_app_token"; token: string }
    | { kind: "set_dark_mode"; dark_mode: boolean };

/** The parts of a `MessageEvent` the client reads */
export type MiniAppMessageEvent = { data: unknown; origin: string; source: unknown };

/** The parts of `window` the client uses */
export interface MiniAppWindow {
    readonly parent: { postMessage(message: MiniAppToOpenChat, targetOrigin: string): void };
    addEventListener(type: "message", listener: (event: MiniAppMessageEvent) => void): void;
    removeEventListener(type: "message", listener: (event: MiniAppMessageEvent) => void): void;
}

export type ConnectOptions = {
    /**
     * The origins OpenChat may be served from, eg. `["https://oc.app"]`. By default the app accepts
     * whichever origin the window it's framed in has.
     */
    openChatOrigins?: string[];
    /** How long to wait for OpenChat to initialise the app, or to send a new token. 10s by default. */
    timeoutMs?: number;
    /** How long before the token expires to ask for a new one. A minute by default. */
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
 * Connects the app to OpenChat: tells it the app is ready, and resolves once OpenChat has sent the
 * app its token. Rejects if the page isn't framed, or OpenChat doesn't answer in time.
 *
 * ```ts
 * const openChat = await connectToOpenChat();
 * document.documentElement.dataset.theme = openChat.darkMode ? "dark" : "light";
 * openChat.onDarkModeChange((dark) => (document.documentElement.dataset.theme = dark ? "dark" : "light"));
 *
 * // With the token in the `x-oc-jwt` header, and a new one if the bot answers with a 401
 * const response = await openChat.fetch("api/presses");
 * ```
 */
export function connectToOpenChat(options: ConnectOptions = {}): Promise<MiniAppClient> {
    const win = options.window ?? (globalThis as unknown as { window?: MiniAppWindow }).window;
    if (win === undefined) {
        return Promise.reject(new Error("connectToOpenChat runs in the app's page, in a browser"));
    }
    if ((win.parent as unknown) === win) {
        return Promise.reject(new Error("The app isn't in a frame, so OpenChat didn't open it"));
    }

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            win.removeEventListener("message", listener);
            reject(new Error("OpenChat didn't initialise the app"));
        }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

        const listener = (event: MiniAppMessageEvent) => {
            if (event.source !== win.parent) return;
            if (options.openChatOrigins && !options.openChatOrigins.includes(event.origin)) return;
            const message = openChatMessage(event.data);
            if (message?.kind !== "initialise_mini_app") return;

            clearTimeout(timer);
            win.removeEventListener("message", listener);
            resolve(new MiniAppClient(win, event.origin, message, options));
        };

        win.addEventListener("message", listener);
        win.parent.postMessage({ kind: "mini_app_ready" }, "*");
    });
}

/** The app's connection to OpenChat, from `connectToOpenChat` */
export class MiniAppClient {
    #window: MiniAppWindow;
    #token: string;
    #darkMode: boolean;
    #locale: string;
    #darkModeListeners = new Set<(darkMode: boolean) => void>();
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
        /** OpenChat's origin, which the app sends everything to */
        public readonly openChatOrigin: string,
        initialise: Extract<OpenChatToMiniApp, { kind: "initialise_mini_app" }>,
        options: ConnectOptions = {},
    ) {
        this.#window = window;
        this.#token = initialise.token;
        this.#darkMode = initialise.dark_mode;
        this.#locale = initialise.locale;
        this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.#refreshBeforeExpiryMs =
            options.refreshBeforeExpiryMs ?? DEFAULT_REFRESH_BEFORE_EXPIRY_MS;
        this.#fetch = options.fetch;
        window.addEventListener("message", this.#onMessage);
        this.#scheduleRefresh();
    }

    /**
     * The user's current `BotMessageSession` token, for the bot's server, which verifies it. The
     * client asks OpenChat for a new one shortly before it expires.
     */
    token(): string {
        return this.#token;
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
     * Asks OpenChat for a new token, eg. as the bot's server refused the current one with a 401,
     * resolving with it once OpenChat sends it. Requests made while one is waiting share it.
     * Rejects if OpenChat doesn't answer in time, eg. as the user has left the chat.
     */
    refreshToken(): Promise<string> {
        if (this.#closed) {
            return Promise.reject(new Error("The client is closed"));
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

    /** Calls `callback` whenever the user's theme changes. Returns a function which stops it. */
    onDarkModeChange(callback: (darkMode: boolean) => void): () => void {
        this.#darkModeListeners.add(callback);
        return () => this.#darkModeListeners.delete(callback);
    }

    /**
     * `fetch`, with the token in the `x-oc-jwt` header. If the bot answers with a 401, it asks
     * OpenChat for a new token and tries once more, so give it a body it can send twice, eg. a
     * string.
     */
    async fetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
        const send = () => {
            const headers = new Headers(init.headers);
            headers.set(MINI_APP_TOKEN_HEADER, this.#token);
            return (this.#fetch ?? fetch)(input, { ...init, headers });
        };

        const response = await send();
        if (response.status !== 401) {
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
        if (this.#tokenRequest !== undefined) {
            clearTimeout(this.#tokenRequest.timer);
            this.#tokenRequest.reject(new Error("The client is closed"));
            this.#tokenRequest = undefined;
        }
        this.#darkModeListeners.clear();
    }

    #onMessage = (event: MiniAppMessageEvent) => {
        if (event.source !== this.#window.parent || event.origin !== this.openChatOrigin) return;
        const message = openChatMessage(event.data);
        switch (message?.kind) {
            case "initialise_mini_app":
                this.#locale = message.locale;
                this.#setDarkMode(message.dark_mode);
                this.#setToken(message.token);
                break;
            case "mini_app_token":
                this.#setToken(message.token);
                break;
            case "set_dark_mode":
                this.#setDarkMode(message.dark_mode);
                break;
        }
    };

    #setToken(token: string) {
        this.#token = token;
        this.#scheduleRefresh();
        if (this.#tokenRequest !== undefined) {
            clearTimeout(this.#tokenRequest.timer);
            this.#tokenRequest.resolve(token);
            this.#tokenRequest = undefined;
        }
    }

    #setDarkMode(darkMode: boolean) {
        if (darkMode === this.#darkMode) return;
        this.#darkMode = darkMode;
        for (const listener of this.#darkModeListeners) {
            listener(darkMode);
        }
    }

    #scheduleRefresh() {
        clearTimeout(this.#refreshTimer);
        const expiry = tokenExpiry(this.#token);
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

// The message, if it's one of OpenChat's with the fields its kind has
function openChatMessage(data: unknown): OpenChatToMiniApp | undefined {
    if (typeof data !== "object" || data === null) return undefined;
    const message = data as Record<string, unknown>;
    switch (message.kind) {
        case "initialise_mini_app":
            // Only the token is needed: the theme and language fall back to light and English
            return typeof message.token === "string"
                ? {
                      kind: "initialise_mini_app",
                      token: message.token,
                      dark_mode: message.dark_mode === true,
                      locale: typeof message.locale === "string" ? message.locale : "en",
                  }
                : undefined;
        case "mini_app_token":
            return typeof message.token === "string" ? (message as OpenChatToMiniApp) : undefined;
        case "set_dark_mode":
            return typeof message.dark_mode === "boolean"
                ? (message as OpenChatToMiniApp)
                : undefined;
        default:
            return undefined;
    }
}
