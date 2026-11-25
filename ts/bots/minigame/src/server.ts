// MiniGameBot's entry point: reads the config, wires the pieces up and listens
import "dotenv/config";
import {
    BotClientFactory,
    MiniAppTokens,
    type MiniAppServiceClient,
} from "@open-ic/openchat-botclient-ts";
import { createApp } from "./app";
import { StockfishPool } from "./computer/engine";
import { ComputerPlayer } from "./computer/player";
import { configFromEnv } from "./config";
import type { Deps } from "./deps";
import { LiveHub } from "./live";
import { Names } from "./names";
import { Publisher } from "./publisher";
import { GameStore } from "./store";
import { endGamesOutOfTime, SWEEP_EVERY_MS } from "./sweep";

const PRUNE_EVERY_MS = 60 * 60 * 1000;

const config = configFromEnv();

const factory = new BotClientFactory({
    openchatPublicKey: config.openchatPublicKey,
    icHost: config.icHost,
    identityPrivateKey: config.identityPrivateKey,
    openStorageCanisterId: config.openStorageCanisterId,
    userIndexCanisterId: config.userIndexCanisterId,
});

const store = new GameStore(config.dataFile);
if (config.apiGateway !== undefined) {
    store.apiGateway = config.apiGateway;
}

// One service client, for the LocalUserIndex it gets the bot's token from: the config's, or the
// last command's. Any LocalUserIndex knows every bot, so the client isn't remade for a command
// from another.
let cachedClient: MiniAppServiceClient | undefined;
let cachedGateway: string | undefined;
function serviceClient(gateway: string | undefined): MiniAppServiceClient | undefined {
    if (gateway === undefined) return undefined;
    if (cachedClient === undefined || cachedGateway !== gateway) {
        cachedClient = factory.createMiniAppServiceClient(config.miniAppServiceUrl, gateway);
        cachedGateway = gateway;
    }
    return cachedClient;
}

// The service's public key and the bot's id are each fetched once, on first use: the bot's id
// isn't known until OpenChat has registered it
let tokens: Promise<MiniAppTokens> | undefined;
function miniAppTokens(): Promise<MiniAppTokens> {
    if (tokens === undefined) {
        const client = serviceClient(store.apiGateway);
        if (client === undefined) {
            return Promise.reject(new Error("No LocalUserIndex is known yet: run /play first"));
        }
        tokens = Promise.all([client.publicKey(), factory.botId()]).then(
            ([publicKey, botId]) => new MiniAppTokens(publicKey, botId),
        );
        tokens.catch(() => {
            tokens = undefined;
        });
    }
    return tokens;
}

const miniApps = () => serviceClient(store.apiGateway);

const deps: Deps = {
    factory,
    store,
    names: new Names(factory),
    publisher: new Publisher(miniApps, store),
    miniApps,
    useApiGateway: (gateway) => {
        if (store.apiGateway === undefined) {
            store.apiGateway = gateway;
        }
        return serviceClient(store.apiGateway)!;
    },
    tokens: miniAppTokens,
    raceSettings: config.raceSettings,
};

// The computer's moves, at chess against it
const engine = new StockfishPool();
const computer = new ComputerPlayer(engine, store, deps.publisher);
deps.computer = computer;

deps.publisher.publishUnfinished();

// Players of a live game get each change at once over a socket, wherever the change came from
const live = new LiveHub(deps);
deps.publisher.onPublish((game) => live.changed(game));

const app = createApp(deps, config.appDir);
const server = app.listen(config.port, () => {
    console.log(`MiniGameBot listening on port ${config.port}, with ${store.size} games`);
});
live.attach(server);

setInterval(() => {
    endGamesOutOfTime(store, deps.publisher);
    // Any game whose move is the computer's and isn't being searched, eg. one loaded as the bot
    // started, or whose search failed
    computer.pokeAll();
}, SWEEP_EVERY_MS).unref();

setInterval(() => {
    const dropped = store.prune();
    if (dropped > 0) console.log(`Dropped ${dropped} old games`);
}, PRUNE_EVERY_MS).unref();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
        engine.stop();
        store.flush();
        process.exit(0);
    });
}
