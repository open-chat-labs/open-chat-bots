// Helpers for games played in MiniApp messages.
//
// Games must never involve wagering tokens, or anything else of value: that's gambling, which
// OpenChat isn't licensed for.

import type { MessageButton, MessageButtonStyle, MiniAppContent } from "../domain/event";

export type LobbyState = "open" | "started";

/** Why a player can't join, leave or start the game. `lobbyErrorMessage` words it for them. */
export type LobbyError =
    | "already_started"
    | "already_joined"
    | "full"
    | "not_a_player"
    // The host can't leave, as they start the game
    | "host_cant_leave"
    | "not_the_host"
    | "too_few_players";

export type LobbyResult = { kind: "success" } | { kind: "error"; error: LobbyError };

/** The error, worded for the player, eg. for an `ActionResponse.reply` */
export function lobbyErrorMessage(error: LobbyError): string {
    switch (error) {
        case "already_started":
            return "The game has already started";
        case "already_joined":
            return "You've already joined";
        case "full":
            return "The game is full";
        case "not_a_player":
            return "You haven't joined";
        case "host_cant_leave":
            return "You're the host, so you can't leave";
        case "not_the_host":
            return "Only the host can start the game";
        case "too_few_players":
            return "There aren't enough players yet";
    }
}

/** A lobby as JSON, eg. to store it */
export type LobbyJson = {
    host: string;
    players: string[];
    minPlayers: number;
    maxPlayers: number;
    state: LobbyState;
};

const SUCCESS: LobbyResult = { kind: "success" };

function failure(error: LobbyError): LobbyResult {
    return { kind: "error", error };
}

/**
 * Players gathering for a game, which the bot keeps. OpenChat only stores the message, rendered from
 * it. Keep each lobby by its message's chat, thread and message id together, eg. by
 * `session.messageKey`, as a message id is only unique within its chat and thread, and don't let a
 * new game replace one already kept under the same key.
 *
 * The host, who posted it, is its first player, and starts the game once enough have joined.
 */
export class Lobby {
    /** The ids of the buttons `render` shows */
    static readonly JOIN = "join";
    static readonly LEAVE = "leave";
    static readonly START = "start";

    /** In the order they joined, the host first */
    players: string[];
    state: LobbyState = "open";

    /**
     * An open lobby whose only player is its host. `minPlayers` must be at least 1 and at most
     * `maxPlayers`.
     */
    constructor(
        public readonly host: string,
        public readonly minPlayers: number,
        public readonly maxPlayers: number,
    ) {
        if (
            !Number.isInteger(minPlayers) ||
            !Number.isInteger(maxPlayers) ||
            minPlayers < 1 ||
            minPlayers > maxPlayers
        ) {
            throw new Error("A lobby needs 1 <= minPlayers <= maxPlayers");
        }
        this.players = [host];
    }

    static fromJSON(json: LobbyJson): Lobby {
        const lobby = new Lobby(json.host, json.minPlayers, json.maxPlayers);
        lobby.players = [...json.players];
        lobby.state = json.state;
        return lobby;
    }

    toJSON(): LobbyJson {
        return {
            host: this.host,
            players: [...this.players],
            minPlayers: this.minPlayers,
            maxPlayers: this.maxPlayers,
            state: this.state,
        };
    }

    isPlayer(user: string): boolean {
        return this.players.includes(user);
    }

    join(user: string): LobbyResult {
        if (this.state === "started") return failure("already_started");
        if (this.isPlayer(user)) return failure("already_joined");
        if (this.players.length >= this.maxPlayers) return failure("full");
        this.players.push(user);
        return SUCCESS;
    }

    leave(user: string): LobbyResult {
        if (this.state === "started") return failure("already_started");
        if (user === this.host) return failure("host_cant_leave");
        if (!this.isPlayer(user)) return failure("not_a_player");
        this.players = this.players.filter((p) => p !== user);
        return SUCCESS;
    }

    /** Starts the game, if `user` is the host and enough players have joined */
    start(user: string): LobbyResult {
        if (this.state === "started") return failure("already_started");
        if (user !== this.host) return failure("not_the_host");
        if (this.players.length < this.minPlayers) return failure("too_few_players");
        this.state = "started";
        return SUCCESS;
    }

    /**
     * The lobby as a MiniApp message: its title, players and what it's waiting for, with Join and
     * Leave buttons for everyone and a Start button for the host, until it's started. Each player
     * is mentioned, as `@UserId(<id>)`, which OpenChat shows as their name. The text fits within
     * OpenChat's limit for up to 40 players.
     */
    render(title: string): MiniAppContent {
        const players = this.players
            .map((player) =>
                player === this.host ? `@UserId(${player}) (host)` : `@UserId(${player})`,
            )
            .join(", ");

        let status: string;
        if (this.state === "started") {
            status = "The game has started";
        } else if (this.players.length < this.minPlayers) {
            const needed = this.minPlayers - this.players.length;
            status = `Waiting for ${needed} more player${needed === 1 ? "" : "s"}`;
        } else {
            status = `Waiting for @UserId(${this.host}) to start`;
        }

        const text = `**${title}**\nPlayers (${this.players.length} of ${this.maxPlayers}): ${players}\n${status}`;

        const buttonRows: MessageButton[][] =
            this.state === "started"
                ? []
                : [
                      [
                          button(Lobby.JOIN, "Join", "primary"),
                          button(Lobby.LEAVE, "Leave", "secondary"),
                          button(Lobby.START, "Start", "primary", [this.host]),
                      ],
                  ];

        return { kind: "mini_app_content", text, buttonRows };
    }
}

function button(
    id: string,
    label: string,
    style: MessageButtonStyle,
    visibleTo?: string[],
): MessageButton {
    return { id, label, style, visibleTo };
}
