// The bot's games, keyed by the card each is played from, kept in memory and written to a JSON
// file so that a restart doesn't end them. The file also remembers the LocalUserIndex of the last
// command, which the MiniApp service client gets the bot's token from.
import {
    ChatIdentifier,
    miniAppGameKey,
    type ChannelIdentifier,
    type GroupChatIdentifier,
    type MiniAppGame,
} from "@open-ic/openchat-botclient-ts";
import fs from "node:fs";
import path from "node:path";
import { Race2048, type RaceData } from "./games/race2048/race";

export type GameEntry = { game: MiniAppGame; race: Race2048 };

type GameJson = {
    chat:
        | { kind: "group_chat"; groupId: string }
        | { kind: "channel"; communityId: string; channelId: string };
    thread?: number;
    messageId: string;
};

type EntryJson = { game: GameJson; kind: "2048"; data: RaceData };

type FileJson = { apiGateway?: string; games: Record<string, EntryJson> };

/** How long a finished game is kept, so late requests to it get a clear answer */
const KEEP_FINISHED_MS = 2 * 60 * 60 * 1000;
/** How long an unfinished game is kept. The service ends a game after a day without an update. */
const KEEP_UNFINISHED_MS = 25 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 300;

export class GameStore {
    readonly #file?: string;
    readonly #games = new Map<string, GameEntry>();
    #apiGateway?: string;
    #saveTimer?: NodeJS.Timeout;
    #now: () => number;

    constructor(file?: string, now: () => number = Date.now) {
        this.#file = file;
        this.#now = now;
        this.#load();
    }

    /** The LocalUserIndex of the last command, if any */
    get apiGateway(): string | undefined {
        return this.#apiGateway;
    }

    set apiGateway(gateway: string | undefined) {
        if (gateway !== this.#apiGateway) {
            this.#apiGateway = gateway;
            this.save();
        }
    }

    get(game: MiniAppGame): GameEntry | undefined {
        return this.#games.get(miniAppGameKey(game));
    }

    create(game: MiniAppGame, race: Race2048): GameEntry {
        const entry = { game, race };
        this.#games.set(miniAppGameKey(game), entry);
        this.save();
        return entry;
    }

    delete(game: MiniAppGame): void {
        if (this.#games.delete(miniAppGameKey(game))) {
            this.save();
        }
    }

    get size(): number {
        return this.#games.size;
    }

    /** Every game, for a sweep */
    entries(): IterableIterator<GameEntry> {
        return this.#games.values();
    }

    /** Drops games that are long over, or were never finished */
    prune(): number {
        const now = this.#now();
        let dropped = 0;
        for (const [key, { race }] of this.#games) {
            const d = race.data;
            const old =
                d.phase === "finished"
                    ? (d.finishedAt ?? d.createdAt) + KEEP_FINISHED_MS < now
                    : d.createdAt + KEEP_UNFINISHED_MS < now;
            if (old) {
                this.#games.delete(key);
                dropped++;
            }
        }
        if (dropped > 0) this.save();
        return dropped;
    }

    /** Writes the games shortly, once, however many changes come in meanwhile */
    save(): void {
        if (this.#file === undefined || this.#saveTimer !== undefined) return;
        this.#saveTimer = setTimeout(() => {
            this.#saveTimer = undefined;
            try {
                this.#write();
            } catch (err) {
                console.error("Couldn't save the games:", err);
            }
        }, SAVE_DELAY_MS);
    }

    /** Writes the games now, eg. as the bot stops */
    flush(): void {
        if (this.#file === undefined) return;
        clearTimeout(this.#saveTimer);
        this.#saveTimer = undefined;
        this.#write();
    }

    #write(): void {
        if (this.#file === undefined) return;
        const games: Record<string, EntryJson> = {};
        for (const [key, { game, race }] of this.#games) {
            games[key] = { game: gameToJson(game), kind: "2048", data: race.data };
        }
        const json: FileJson = { apiGateway: this.#apiGateway, games };
        fs.mkdirSync(path.dirname(this.#file), { recursive: true });
        const tmp = `${this.#file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(json));
        fs.renameSync(tmp, this.#file);
    }

    #load(): void {
        if (this.#file === undefined || !fs.existsSync(this.#file)) return;
        const json = JSON.parse(fs.readFileSync(this.#file, "utf8")) as FileJson;
        this.#apiGateway = json.apiGateway;
        for (const [key, entry] of Object.entries(json.games ?? {})) {
            if (entry.kind !== "2048") continue;
            this.#games.set(key, { game: gameFromJson(entry.game), race: new Race2048(entry.data) });
        }
        console.log(`Loaded ${this.#games.size} games from ${this.#file}`);
    }
}

export function gameToJson(game: MiniAppGame): GameJson {
    return {
        chat:
            game.chat.kind === "channel"
                ? {
                      kind: "channel",
                      communityId: game.chat.communityId,
                      channelId: game.chat.channelId.toString(),
                  }
                : { kind: "group_chat", groupId: game.chat.groupId },
        thread: game.thread,
        messageId: game.messageId.toString(),
    };
}

export function gameFromJson(json: GameJson): MiniAppGame {
    return {
        chat: ChatIdentifier.fromJson(json.chat) as GroupChatIdentifier | ChannelIdentifier,
        thread: json.thread,
        messageId: BigInt(json.messageId),
    };
}
