import type { Settings } from "./games/settings";

export type Config = {
    port: number;
    openchatPublicKey: string;
    icHost: string;
    identityPrivateKey: string;
    openStorageCanisterId: string;
    /** OpenChat's UserIndex, for looking players' names up; the SDK's default is mainnet's */
    userIndexCanisterId?: string;
    miniAppServiceUrl: string;
    /** A LocalUserIndex to get the bot's MiniApp service token from, before its first command */
    apiGateway?: string;
    /** Where the games are kept between restarts, or undefined to keep them only in memory */
    dataFile?: string;
    /** The built app, served at `/app` */
    appDir: string;
    /** A race's settings unless the command or the host sets them: the defaults are 2048 and 10 minutes */
    raceSettings?: Settings;
};

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
    const required = (name: string): string => {
        const value = env[name];
        if (value === undefined || value === "") {
            throw new Error(`${name} must be set`);
        }
        return value;
    };
    const optional = (name: string): string | undefined => {
        const value = env[name];
        return value === undefined || value === "" ? undefined : value;
    };
    return {
        port: Number(optional("PORT") ?? 3100),
        openchatPublicKey: required("OC_PUBLIC"),
        icHost: required("IC_HOST"),
        identityPrivateKey: required("IDENTITY_PRIVATE"),
        openStorageCanisterId: required("STORAGE_INDEX_CANISTER"),
        userIndexCanisterId: optional("USER_INDEX_CANISTER"),
        miniAppServiceUrl: required("MINI_APP_SERVICE_URL").replace(/\/$/, ""),
        apiGateway: optional("OC_API_GATEWAY"),
        dataFile: optional("DATA_FILE") ?? "./data/games.json",
        appDir: optional("APP_DIR") ?? "./dist/app",
        raceSettings: raceSettingsFromEnv(optional("RACE_TARGET"), optional("RACE_SECONDS")),
    };
}

/** The race's default settings from the env, for trying a race out: a low tile, a short time */
function raceSettingsFromEnv(target?: string, seconds?: string): Settings | undefined {
    const settings: Settings = {};
    if (target !== undefined) settings.target = Number(target);
    if (seconds !== undefined) settings.minutes = Number(seconds) / 60;
    return Object.keys(settings).length === 0 ? undefined : settings;
}
