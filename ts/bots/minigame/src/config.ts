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
    /** The tile which wins a race, 2048 unless set lower to test a race end to end */
    raceTarget?: number;
    /** How long a race lasts, in ms, 10 minutes unless set shorter to test the time running out */
    raceTimeLimit?: number;
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
        raceTarget: optional("RACE_TARGET") === undefined ? undefined : Number(env.RACE_TARGET),
        raceTimeLimit:
            optional("RACE_SECONDS") === undefined ? undefined : Number(env.RACE_SECONDS) * 1000,
    };
}
