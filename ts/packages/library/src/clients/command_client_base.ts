import { HttpAgent } from "@dfinity/agent";
import jwt from "jsonwebtoken";
import type {
    AuthToken,
    BotActionScope,
    BotClientConfig,
    BotCommandArg,
    DecodedJwt,
    Message,
} from "../types";
import { BadRequestError } from "../utils/badrequest";
import type { BotSendMessageResponse } from "../services/bot_gateway/candid/types";
import { BotClientBase } from "./client_base";
import { Principal } from "@dfinity/principal";

export class CommandBotClientBase extends BotClientBase {
    protected decodedJwt: DecodedJwt;

    constructor(
        agent: HttpAgent,
        env: BotClientConfig,
        protected encodedJwt: string,
    ) {
        super(agent, env);
        this.decodedJwt = this.#decodeJwt(encodedJwt);
        this.createBotService(this.decodedJwt.bot_api_gateway);
    }

    get #authToken(): AuthToken {
        return {
            kind: "jwt",
            token: this.encodedJwt,
        };
    }

    #decodeJwt(token: string): DecodedJwt {
        const publicKey = this.env.openchatPublicKey.replace(/\\n/g, "\n");
        try {
            const decoded = jwt.verify(token, publicKey, { algorithms: ["ES256"] });
            if (typeof decoded !== "string") {
                return decoded as DecodedJwt;
            } else {
                console.error(`Unable to decode jwt`, token);
                throw new BadRequestError("AccessTokenInvalid");
            }
        } catch (err) {
            console.error(`Unable to decode jwt`, err, token);
            throw new BadRequestError("AccessTokenInvalid");
        }
    }

    #namedArg(name: string): BotCommandArg | undefined {
        return this.decodedJwt.command.args.find((a) => a.name === name);
    }

    #principalBytesToString(bytes: Uint8Array): string {
        return Principal.fromUint8Array(bytes).toString();
    }

    public stringArg(name: string): string | undefined {
        const arg = this.#namedArg(name);
        return arg !== undefined && "String" in arg.value ? arg.value.String : undefined;
    }

    public booleanArg(name: string): boolean | undefined {
        const arg = this.#namedArg(name);
        return arg !== undefined && "Boolean" in arg.value ? arg.value.Boolean : undefined;
    }

    public numberArg(name: string): number | undefined {
        const arg = this.#namedArg(name);
        return arg !== undefined && "Number" in arg.value ? arg.value.Number : undefined;
    }

    public userArg(name: string): string | undefined {
        const arg = this.#namedArg(name);
        return arg !== undefined && "User" in arg.value
            ? this.#principalBytesToString(arg.value.User)
            : undefined;
    }

    public get commandArgs(): BotCommandArg[] {
        return this.decodedJwt.command.args;
    }

    public get commandName(): string {
        return this.decodedJwt.command.name;
    }

    public get initiator(): string {
        return this.decodedJwt.command.initiator;
    }

    public get scope(): BotActionScope {
        return this.decodedJwt.scope;
    }

    public isChatScope(): boolean {
        return "Chat" in this.scope;
    }

    public isCommunityScope(): boolean {
        return "Community" in this.scope;
    }

    public get botId(): string {
        return this.decodedJwt.bot;
    }

    public sendMessage(message: Message): Promise<BotSendMessageResponse> {
        return super.sendMessage(message, this.#authToken);
    }
}
