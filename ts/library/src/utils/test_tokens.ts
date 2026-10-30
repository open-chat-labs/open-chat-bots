// For the SDK's own tests: tokens signed as OpenChat, and its MiniApp service, sign them, with
// ES256, by P-256 keys which stand in for theirs
import crypto from "crypto";

function newKey(): crypto.KeyObject {
    return crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
}

export const signingKey = newKey();

// Not theirs
export const otherSigningKey = newKey();

export function publicKeyPem(key: crypto.KeyObject = signingKey): string {
    return crypto.createPublicKey(key).export({ type: "spki", format: "pem" }).toString();
}

// Signs the claims exactly as written, under the header OpenChat writes
export function sign(claimsJson: string, key: crypto.KeyObject = signingKey): string {
    const header = encode(Buffer.from(JSON.stringify({ alg: "ES256" })));
    const claims = encode(Buffer.from(claimsJson));
    const signature = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), {
        key,
        dsaEncoding: "ieee-p1363",
    });
    return `${header}.${claims}.${encode(signature)}`;
}

function encode(bytes: Buffer): string {
    return bytes.toString("base64url");
}

// A user id as OpenChat gives a bot when it's registered: 8 random bytes, unlike any principal the
// bot signs its calls with
export const BOT_ID = "gkkdb-zk6d4-etvrd-xeaaq";

export const API_GATEWAY = "rrkah-fqaaa-aaaaa-aaaaq-cai";
export const GROUP = "ryjl3-tyaaa-aaaaa-aaaba-cai";
export const COMMUNITY = "r7inp-6aaaa-aaaaa-aaabq-cai";
export const USER = "rdmx6-jaaaa-aaaaa-aaadq-cai";
export const OTHER_BOT = "qhbym-qaaaa-aaaaa-aaafq-cai";

export const NOW = 1_800_000_000_000;

export const GAME_JSON = `{"chat":{"Channel":["${COMMUNITY}",7]},"thread":3,"message_id":"18446744073709551615"}`;

// A post token, as the LocalUserIndex writes one: the bot may post one card, for `game`. The SDK
// reads only its game; the service verifies it.
export function postToken(game: string = GAME_JSON): string {
    return sign(
        `{"exp":${NOW / 1000 + 3600},"claim_type":"MiniAppPost","bot":"${BOT_ID}","bot_endpoint":"https://uno.example.com","bot_api_gateway":"${API_GATEWAY}","game":${game},"initiator":"Autonomous"}`,
    );
}

export type PlayerClaimsOptions = {
    claimType?: string;
    bot?: string;
    expSeconds?: number;
    game?: string;
};

// The claims of one of the MiniApp service's tokens, as it writes them: ids as text, the message id
// as a string, and no thread as null
export function playerClaimsJson(options: PlayerClaimsOptions = {}): string {
    const {
        claimType = "MiniAppPlayer",
        bot = BOT_ID,
        expSeconds = NOW / 1000 + 3600,
        game = GAME_JSON,
    } = options;
    return `{"exp":${expSeconds},"claim_type":"${claimType}","bot":"${bot}","game":${game},"user_id":"${USER}"}`;
}

export function playerToken(options: PlayerClaimsOptions = {}, key?: crypto.KeyObject): string {
    return sign(playerClaimsJson(options), key);
}
