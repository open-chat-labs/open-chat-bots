// A bot's games, as OpenChat's MiniApp service knows them. The service sits between OpenChat's
// website and the bot: it posts every card, tracks who's joined each game, is the only thing that
// writes a card's status, and relays the game's state to its players and spectators. See
// `MiniAppServiceClient`.
import type { MiniAppContent } from "./event";
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
 * A card as a bot posts it, through the service, with `MiniAppServiceClient.post`: a
 * `MiniAppContent` without its status, as the service posts a card open. It's a `MiniAppMessage`'s
 * `card`, which `BotClient.createMiniAppMessage` makes.
 */
export type MiniAppCard = Omit<MiniAppContent, "kind" | "status">;

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
 * What one of the MiniApp service's tokens says: a user asks to join one of the bot's games, asks
 * to start it, has left it, or, in a player's token, is playing it
 */
export type MiniAppPlayerClaims = {
    /** The bot's user id */
    bot: string;
    game: MiniAppGame;
    userId: string;
};

/**
 * The bot's answer to the service's `POST <endpoint>/mini_app/join`, within 5 seconds. A refusal's
 * `message` is shown to the user, eg. "Seats are taken". The user isn't playing until the service
 * adds them, after this answer, so don't count them as a player until the bot's asked to start the
 * game, which can come while it's still answering.
 */
export type MiniAppJoinResponse = { accepted: boolean; message?: string };

/**
 * How a bot starts a game when a player asks it to, with `acceptMiniAppStart`.
 *
 * The service holds the game while it asks, so the bot gives the game's first state here, rather
 * than with `MiniAppServiceClient.update`, and its answer mustn't wait on any update of the game,
 * eg. one made while answering a join: that would wait until the start timed out.
 *
 * The service refuses an answer that's invalid in itself: a player listed twice, more players than
 * the game's limit, waiting for someone it doesn't list, or a state that isn't newer.
 */
export type MiniAppStart = {
    /**
     * The user ids of those it starts with, in any order. Each should be playing, or have a join
     * the bot's still answering, as it accepted them. Anyone else isn't added, and the bot's told
     * they left, eg. a player whose leave hadn't reached it yet. Anyone playing whom it leaves out
     * is taken off.
     */
    players: string[];
    /** The players whose turn it is first, each once, or none for no one in particular */
    waitingFor: string[];
    /** The game's first state, whose `seq` is above any state the bot has already sent */
    state?: MiniAppGameState;
};

/**
 * The bot's answer to the service's `POST <endpoint>/mini_app/start`, within 5 seconds, as the
 * service reads it, from `acceptMiniAppStart` or `refuseMiniAppStart`. If a start fails, eg. as it
 * timed out or the service couldn't save it, the player can ask again, so a bot asked to start a
 * game it already started answers with its players as they are now.
 */
export type MiniAppStartResponse =
    | {
          accepted: true;
          players: string[];
          waiting_for: string[];
          state?: MiniAppGameState;
      }
    | { accepted: false; message?: string };

/** Starts a game, in answer to the service's `POST <endpoint>/mini_app/start` */
export function acceptMiniAppStart(start: MiniAppStart): MiniAppStartResponse {
    return {
        accepted: true,
        players: start.players,
        waiting_for: start.waitingFor,
        state: start.state,
    };
}

/**
 * Doesn't start a game, in answer to the service's `POST <endpoint>/mini_app/start`. `message` is
 * shown to the player, eg. "Needs 2 players".
 */
export function refuseMiniAppStart(message?: string): MiniAppStartResponse {
    return { accepted: false, message };
}

/**
 * A bot's update to one of its games, for `MiniAppServiceClient.update`. Whatever's undefined stays
 * as it is. The whole update, with its state, its end state and every player's part of it, is at
 * most 64 KB.
 */
export type MiniAppGameUpdate = {
    game: MiniAppGame;
    /**
     * Ends the game, whether it started or not, after which it never changes. A player starts it,
     * through the service, which asks the bot.
     */
    status?: "finished";
    /**
     * The user ids of the players whose turn it is now, each once, or none for no one in
     * particular
     */
    waitingFor?: string[];
    /** eg. "Bob won", of 1 to 200 characters, only with "finished" */
    result?: string;
    /**
     * How the game ended, as any JSON value but null the bot chooses, eg. the final position and
     * the moves, of at most 16 KB serialized, only with "finished" (null is no end state). OpenChat writes it to the card and hands
     * it to the bot's app, in the card and to any app open as the game finishes, which shows its
     * end view from it. A finished card without one shows the app's image and the result instead.
     */
    endState?: unknown;
    /** Players to take off the game, by user id. A bot can take players off, never put them on. */
    remove?: string[];
    state?: MiniAppGameState;
};

/**
 * A game's state, which the service relays to everyone with the game open. Everyone sees `shared`,
 * spectators included, while each player sees only their own part of `private`, which is keyed by
 * user id. `seq` must go up with each state, as the service drops a state whose `seq` isn't above
 * the last one's. Put a format version in it, so that an app left open from an older release knows
 * to reload, and the last move, so that the app can animate it.
 */
export type MiniAppGameState = {
    seq: number;
    shared: unknown;
    private?: Record<string, unknown>;
};
