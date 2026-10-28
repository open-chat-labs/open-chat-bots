import type { BotClient } from "../clients/bot_client";
import type { BotClientFactory } from "../clients/client_factory";
import type { MiniAppContent } from "../domain/event";
import { MiniAppLimits, MiniAppMessage } from "../domain/message";
import { BotMessageSession, TokenError } from "../domain/message_session";
import type { UnitResult } from "../domain/response";
import { ActionResponse, actionHttpResponse, type ActionHttpResponse } from "./action_response";

/** The body of a button press */
export type ActionArgs = {
    button_id: string;
};

/** A user pressing a button on one of the bot's MiniApp messages */
export class ButtonPress {
    constructor(
        /** Who pressed the button, and on which message, as OpenChat vouches */
        public readonly session: BotMessageSession,
        /**
         * The `id` of the button pressed. OpenChat doesn't check it's one of the message's buttons,
         * nor that it was shown to the user, so the bot checks both.
         */
        public readonly buttonId: string,
        /**
         * A client acting autonomously in the message's chat, through the LocalUserIndex which
         * signed the token. The bot needs the autonomous permissions for what it does there.
         */
        public readonly client: BotClient,
    ) {}

    /** The user who pressed the button */
    get userId(): string {
        return this.session.userId;
    }

    /**
     * Edits the message the button is on, in its thread, eg. to show a game's new state. The bot
     * needs the autonomous MiniApp permission. Check the content with `validateMiniAppContent`
     * first, as OpenChat refuses content beyond its limits.
     */
    editMessage(miniApp: Omit<MiniAppContent, "kind">): Promise<UnitResult> {
        const message = new MiniAppMessage(miniApp).setThread<MiniAppMessage>(this.session.thread);
        return this.client.editMessage(this.session.messageId, message);
    }
}

export interface ActionHandler {
    /**
     * Whether this handler answers presses of the button with this id, eg. by a prefix its buttons
     * share. By default it answers them all.
     */
    handles?(buttonId: string): boolean;

    /**
     * Acts on the press, eg. moving a piece in a game and editing the message to show it. A press
     * of a button the user can't press now is answered with an `ActionResponse.reply` saying why,
     * or an `ActionResponse.badRequest`.
     */
    execute(press: ButtonPress): Promise<ActionResponse>;
}

export type ActionHandlerRegistryOptions = {
    /**
     * The user id OpenChat gave the bot when it was registered, which isn't its principal. By
     * default it's fetched from the UserIndex, with `BotClientFactory.botId()`, when the first
     * press arrives. That asks the UserIndex in the factory's `userIndexCanisterId`, which
     * defaults to OpenChat's on mainnet, so off mainnet set `userIndexCanisterId` or pass this.
     */
    botId?: string;
};

/** The parts of an express request which `expressHandler` reads */
export type ActionRequest = {
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
};

/** The parts of an express response which `expressHandler` writes */
export type ActionResponseWriter = {
    setHeader(name: string, value: string): unknown;
    status(code: number): { send(body: string): unknown };
};

/**
 * Gives each press of a button on the bot's MiniApp messages to the first registered handler which
 * `handles` the button, once the user's token is verified.
 *
 * The website POSTs each press to the bot's `/execute_action` endpoint, with the user's
 * `BotMessageSession` token in the `x-oc-jwt` header and `{"button_id": "<id>"}` as the body. With
 * express:
 *
 * ```ts
 * const actions = new ActionHandlerRegistry(factory).register(ticTacToe);
 * app.post("/execute_action", express.json(), actions.expressHandler());
 * ```
 */
export class ActionHandlerRegistry {
    #handlers: ActionHandler[] = [];
    #factory: BotClientFactory;
    #botId?: string;

    constructor(factory: BotClientFactory, options: ActionHandlerRegistryOptions = {}) {
        this.#factory = factory;
        this.#botId = options.botId;
    }

    /** Adds a handler, or a function answering every button, after those already registered */
    register(handler: ActionHandler | ActionHandler["execute"]): this {
        this.#handlers.push(typeof handler === "function" ? { execute: handler } : handler);
        return this;
    }

    /**
     * Handles a POST to `/execute_action`: `token` is the `x-oc-jwt` header and `body` the
     * request's body, as JSON text, bytes or already parsed. The token is checked before the body.
     */
    async execute(
        token: string | undefined,
        body: unknown,
        now: number = Date.now(),
    ): Promise<ActionResponse> {
        if (!token) {
            return ActionResponse.unauthorized("AccessTokenNotFound");
        }

        let botId: string;
        try {
            botId = this.#botId ?? (await this.#factory.botId());
        } catch (err) {
            return ActionResponse.internalError(`The bot doesn't know its id yet: ${err}`);
        }

        let session: BotMessageSession;
        try {
            session = BotMessageSession.parse(
                token,
                this.#factory.env.openchatPublicKey,
                botId,
                now,
            );
        } catch (err) {
            return ActionResponse.unauthorized(err instanceof TokenError ? err.message : `${err}`);
        }

        const args = parseArgs(body);
        if (typeof args === "string") {
            return ActionResponse.badRequest(args);
        }
        const buttonId = args.button_id;
        const idBytes = new TextEncoder().encode(buttonId).length;
        if (idBytes === 0 || idBytes > MiniAppLimits.MAX_ID_BYTES) {
            return ActionResponse.badRequest("Button id invalid");
        }

        // A handler's own code, `handles` included, can throw, which is answered with a 500
        try {
            const handler = this.#handlers.find((h) => h.handles?.(buttonId) ?? true);
            if (handler === undefined) {
                return ActionResponse.badRequest(`Unknown button: ${buttonId}`);
            }

            const client = this.#factory.createClientInAutonomouseContext(
                session.scope,
                session.apiGateway,
            );
            return await handler.execute(new ButtonPress(session, buttonId, client));
        } catch (err) {
            console.error("OpenChat action handler failed with: ", err);
            return ActionResponse.internalError(`${err}`);
        }
    }

    /**
     * An express route handler for `/execute_action`, after a body parser, eg.
     * `app.post("/execute_action", express.json(), actions.expressHandler())`
     */
    expressHandler(): (req: ActionRequest, res: ActionResponseWriter) => Promise<void> {
        // It never rejects, as express 4 leaves the request hanging if a route's promise does
        return async (req, res) => {
            let response: ActionHttpResponse;
            try {
                const header = req.headers["x-oc-jwt"];
                const token = Array.isArray(header) ? header[0] : header;
                response = actionHttpResponse(await this.execute(token, req.body));
            } catch (err) {
                console.error("OpenChat action handler failed with: ", err);
                response = actionHttpResponse(ActionResponse.internalError(`${err}`));
            }
            res.setHeader("Content-Type", response.contentType);
            res.status(response.status).send(response.body);
        };
    }
}

// The press's args, or why they're invalid
function parseArgs(body: unknown): ActionArgs | string {
    let value = body;
    if (value instanceof Uint8Array) {
        value = new TextDecoder().decode(value);
    }
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        } catch (err) {
            return `Args invalid: ${err}`;
        }
    }
    if (
        typeof value !== "object" ||
        value === null ||
        typeof (value as Partial<ActionArgs>).button_id !== "string"
    ) {
        return 'Args invalid: expected {"button_id": "<id>"}';
    }
    return { button_id: (value as ActionArgs).button_id };
}
