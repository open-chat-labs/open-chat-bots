// A bot's games, as OpenChat's MiniApp service knows them. The service sits between OpenChat's
// website and the bot: it tracks who's joined each game, is the only thing that writes a game's
// card, and relays the game's state to its players and spectators. See `MiniAppServiceClient`.
import type { MiniAppStatus } from "./event";
import type { ChannelIdentifier, GroupChatIdentifier } from "./identifiers";

/** A game, which is played from one of the bot's MiniApp cards */
export type MiniAppGame = {
    chat: GroupChatIdentifier | ChannelIdentifier;
    /** The thread the card is in, by its root message's index, if any */
    thread?: number;
    /** The card's message id */
    messageId: bigint;
};

/**
 * A key for a game which is unique across chats and threads, eg. for a `Map`. A message id alone
 * isn't: it's only unique within its chat and thread.
 */
export function miniAppGameKey(game: MiniAppGame): string {
    const chatKey =
        game.chat.kind === "channel"
            ? `channel:${game.chat.communityId}:${game.chat.channelId}`
            : `group:${game.chat.groupId}`;
    return `${chatKey}/${game.thread ?? "-"}/${game.messageId}`;
}

/**
 * What one of the MiniApp service's tokens says: a user asks to join one of the bot's games, has
 * left it, or, in a player's token, is playing it
 */
export type MiniAppPlayerClaims = {
    /** The bot's user id */
    bot: string;
    game: MiniAppGame;
    userId: string;
};

/**
 * The bot's answer to the service's `POST <endpoint>/mini_app/join`, within 5 seconds. A refusal's
 * `message` is shown to the user, eg. "Seats are taken".
 */
export type MiniAppJoinResponse = { accepted: boolean; message?: string };

/** Where a game's got to. It only moves forward: open, then active, then finished. */
export type MiniAppGameStatus = MiniAppStatus["kind"];

/**
 * A bot's update to one of its games, for `MiniAppServiceClient.update`. Whatever's undefined stays
 * as it is.
 */
export type MiniAppGameUpdate = {
    game: MiniAppGame;
    /**
     * "active" closes joining, and the service writes the game's players to its card. "finished"
     * ends the game, after which it never changes.
     */
    status?: MiniAppGameStatus;
    /**
     * The user ids of the players whose turn it is now, each once, or none for no one in
     * particular
     */
    waitingFor?: string[];
    /** eg. "Bob won", of 1 to 200 characters, only with "finished" */
    result?: string;
    /** Players to take off the game, by user id. A bot can take players off, never put them on. */
    remove?: string[];
    state?: MiniAppGameState;
};

/**
 * A game's state, which the service relays to everyone with the game open. Everyone sees `shared`,
 * spectators included, while each player sees only their own part of `private`, which is keyed by
 * user id. `seq` must go up with each state, as the service, and the app, drop a state whose `seq`
 * isn't above the last one's. Put a format version in it, so that an app left open from an older
 * release knows to reload, and the last move, so that the app can animate it. It's at most 64 KB,
 * with every player's part.
 */
export type MiniAppGameState = {
    seq: number;
    shared: unknown;
    private?: Record<string, unknown>;
};
