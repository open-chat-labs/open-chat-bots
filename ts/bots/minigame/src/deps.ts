// What the request handlers share
import type {
    BotClientFactory,
    MiniAppServiceClient,
    MiniAppTokens,
} from "@open-ic/openchat-botclient-ts";
import type { Settings } from "./games/settings";
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
    /** A race's settings unless the command or the host sets them, eg. a quick race for a test */
    raceSettings?: Settings;
};
