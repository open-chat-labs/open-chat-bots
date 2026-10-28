import type { Message } from "../domain/message";
import type { BotMessageContent } from "../typebox/typebox";

/**
 * Shown to the user who pressed the button, and no one else, like a command's ephemeral reply. It's
 * gone once they reload the page.
 */
export type ActionMessage = {
    // Usually text
    content: BotMessageContent;
    block_level_markdown: boolean;
};

/**
 * What a bot answers a button press with, which `actionHttpResponse` turns into the response the
 * website expects:
 *
 * | kind                | status | body                                                    |
 * | ------------------- | ------ | ------------------------------------------------------- |
 * | `success`           | 200    | JSON, `{ "message"?: { "content", "block_level_markdown" } }` |
 * | `bad_request`       | 400    | the reason, as text                                     |
 * | `unauthorized`      | 401    | the reason, as text. The website fetches a new token and tries once more. |
 * | `too_many_requests` | 429    | none                                                    |
 * | `internal_error`    | 500    | the error, as text                                      |
 */
export type ActionResponse =
    | { kind: "success"; message?: ActionMessage }
    // Eg. the button isn't one the user can press now
    | { kind: "bad_request"; reason: string }
    // The token is invalid or has expired
    | { kind: "unauthorized"; reason: string }
    | { kind: "too_many_requests" }
    | { kind: "internal_error"; error: string };

export const ActionResponse = {
    /** Success, with nothing to show the user */
    ok(): ActionResponse {
        return { kind: "success" };
    },

    /**
     * Success, showing `text` to the user who pressed the button, and no one else, eg. "It's not
     * your turn"
     */
    reply(text: string): ActionResponse {
        return {
            kind: "success",
            message: { content: { Text: { text } }, block_level_markdown: false },
        };
    },

    /** Success, showing `message` to the user who pressed the button, and no one else */
    replyWith(message: Message): ActionResponse {
        const { content, block_level_markdown } = message.toResponse();
        return { kind: "success", message: { content, block_level_markdown } };
    },

    badRequest(reason: string): ActionResponse {
        return { kind: "bad_request", reason };
    },

    unauthorized(reason: string): ActionResponse {
        return { kind: "unauthorized", reason };
    },

    tooManyRequests(): ActionResponse {
        return { kind: "too_many_requests" };
    },

    internalError(error: string): ActionResponse {
        return { kind: "internal_error", error };
    },
};

/** An `ActionResponse` as an HTTP response */
export type ActionHttpResponse = {
    status: number;
    contentType: "application/json" | "text/plain";
    body: string;
};

/** The response as the website expects it, for a bot's HTTP glue to send */
export function actionHttpResponse(response: ActionResponse): ActionHttpResponse {
    switch (response.kind) {
        case "success":
            return {
                status: 200,
                contentType: "application/json",
                body: toJson(response.message === undefined ? {} : { message: response.message }),
            };
        case "bad_request":
            return { status: 400, contentType: "text/plain", body: response.reason };
        case "unauthorized":
            return { status: 401, contentType: "text/plain", body: response.reason };
        case "too_many_requests":
            return { status: 429, contentType: "text/plain", body: "" };
        case "internal_error":
            return { status: 500, contentType: "text/plain", body: response.error };
    }
}

// As OpenChat reads JSON: bigints as strings and bytes as arrays of numbers, whether or not the
// prototypes have been patched, as the SDK's entry point does
function toJson(value: unknown): string {
    return JSON.stringify(value, (_, v) => {
        if (typeof v === "bigint") return v.toString();
        if (v instanceof Uint8Array) return Array.from(v);
        return v;
    });
}
