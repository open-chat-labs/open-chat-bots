import { HttpAgent } from "@dfinity/agent";
import { CandidService } from "../../utils/candidService";
import { type BotService, idlFactory } from "./candid/idl";
import type {
    BotSendMessageResponse,
    AuthToken as ApiAuthToken,
    BotCreateChannelResponse,
} from "./candid/types";
import type { AuthToken, BotClientConfig, ChannelOptions, Message } from "../../types";
import { random128 } from "../../utils/rng";

export class BotGatewayClient extends CandidService {
    #botService: BotService;

    constructor(
        canisterId: string,
        agent: HttpAgent,
        protected env: BotClientConfig,
    ) {
        super();

        this.#botService = CandidService.createServiceClient<BotService>(
            idlFactory,
            canisterId,
            env.icHost,
            agent,
        );
    }

    #mapAuthToken(auth: AuthToken): ApiAuthToken {
        switch (auth.kind) {
            case "api_key":
                return {
                    ApiKey: auth.token,
                };
            case "jwt":
                return {
                    Jwt: auth.token,
                };
        }
    }

    sendMessage(message: Message, auth: AuthToken): Promise<BotSendMessageResponse> {
        return CandidService.handleResponse(
            this.#botService.bot_send_message({
                channel_id: [],
                message_id: [],
                content: message.content,
                finalised: message.finalised,
                block_level_markdown: message.blockLevelMarkdown ?? false,
                auth_token: this.#mapAuthToken(auth),
            }),
            (res) => {
                if (!("Success" in res)) {
                    console.error("Call to execute_bot_action failed with: ", JSON.stringify(res));
                }
                return res;
            },
        ).catch((err) => {
            console.error("Call to execute_bot_action failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    createChannel(
        name: string,
        description: string,
        options: ChannelOptions,
        auth: AuthToken,
    ): Promise<BotCreateChannelResponse> {
        return CandidService.handleResponse(
            this.#botService.bot_create_channel({
                is_public: options.isPublic,
                permissions: optional(options.permissions, identity),
                gate_config: optional(options.gateConfig, identity),
                auth_token: this.#mapAuthToken(auth),
                external_url: optional(options.externalUrl, identity),
                name,
                description,
                events_ttl: optional(options.eventsTtl, identity),
                messages_visible_to_non_members: options.messagesVisibleToNonMembers,
                history_visible_to_new_joiners: options.historyVisibleToNewJoiners,
                rules: options.rules,
                avatar: optional(options.avatar, (data) => {
                    return {
                        id: random128(),
                        data,
                        mime_type: "image/jpg",
                    };
                }),
            }),
            (res) => {
                if (!("Success" in res)) {
                    console.error("Call to execute_bot_action failed with: ", JSON.stringify(res));
                }
                return res;
            },
        ).catch((err) => {
            console.error("Call to execute_bot_action failed with: ", JSON.stringify(err));
            throw err;
        });
    }
}

function optional<A, B>(domain: A | undefined, mapper: (a: A) => B): [] | [B] {
    return domain === undefined ? [] : [mapper(domain)];
}

function identity<A>(a: A): A {
    return a;
}
