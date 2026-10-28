// For the SDK's own tests: tokens signed as OpenChat signs them, with ES256, by P-256 keys which
// stand in for OpenChat's
import crypto from "crypto";

function newKey(): crypto.KeyObject {
    return crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
}

export const signingKey = newKey();

// Not OpenChat's
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

export type SessionClaimsOptions = {
    claimType?: string;
    bot?: string;
    expSeconds?: number;
    chat?: string;
    thread?: number | null;
    messageId?: string;
    meta?: string;
};

// As OpenChat writes the claims: ids as text, the message id as a string, and each None as null
export function sessionClaimsJson(options: SessionClaimsOptions = {}): string {
    const {
        claimType = "BotMessageSession",
        bot = BOT_ID,
        expSeconds = NOW / 1000 + 900,
        chat = `{"Channel":["${COMMUNITY}",7]}`,
        thread = 3,
        messageId = "18446744073709551615",
        meta = `{"timezone":"Europe/London","language":"fr"}`,
    } = options;
    return `{"exp":${expSeconds},"claim_type":"${claimType}","bot_api_gateway":"${API_GATEWAY}","bot":"${bot}","chat":${chat},"thread":${thread},"message_id":"${messageId}","user_id":"${USER}","meta":${meta}}`;
}

export function sessionToken(options: SessionClaimsOptions = {}): string {
    return sign(sessionClaimsJson(options));
}
