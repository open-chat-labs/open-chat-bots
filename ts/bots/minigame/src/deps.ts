// What the request handlers share
import type {
    BotClientFactory,
    MiniAppServiceClient,
    MiniAppTokens,
} from "@open-ic/openchat-botclient-ts";
import type { Names } from "./names";
import type { Publisher } from "./publisher";
import type { GameStore } from "./store";

export type Deps = {
    factory: BotClientFactory;
    store: GameStore;
    publisher: Publisher;
    names: Names;
    /** The MiniApp service client, once a LocalUserIndex to get the bot's token from is known */
    miniApps: () => MiniAppServiceClient | undefined;
    /** Remembers a command's LocalUserIndex, so the service client can be made */
    useApiGateway: (gateway: string) => MiniAppServiceClient;
    /** The verifier of the service's tokens, made on first use: it needs the bot's id */
    tokens: () => Promise<MiniAppTokens>;
    /** The tile which wins a race, if not 2048 */
    raceTarget?: number;
    /** How long a race lasts, in ms, if not 10 minutes */
    raceTimeLimit?: number;
};
