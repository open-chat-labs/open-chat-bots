import { HttpAgent } from "@dfinity/agent";
import { CandidService } from "../../utils/candidService";
import { type BotService, idlFactory } from "./candid/idl";
import type { ExecuteBotCommandResponse } from "./candid/types";
import { accessTokenInvalid } from "../../utils/badrequest";
import type { BotAction, BotClientConfig } from "../../types";

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

    executeAction(action: BotAction, jwt: string): Promise<ExecuteBotCommandResponse> {
        return CandidService.handleResponse(
            this.#botService.execute_bot_action({
                jwt,
                action: action,
            }),
            (res) => {
                if (!("Ok" in res)) {
                    console.error("Call to execute_bot_action failed with: ", JSON.stringify(res));
                }
                return res;
            },
        ).catch((err) => {
            console.error("Call to execute_bot_action failed with: ", JSON.stringify(err));
            throw err;
        });
    }

    getAuthToken(apiKey: string): Promise<string> {
        return CandidService.handleResponse(
            this.#botService.access_token_v2({
                BotActionByApiKey: apiKey,
            }),
            (res) => {
                if ("Success" in res) {
                    return res.Success;
                }
                console.error("Unable to obtain an auth jwt: ", res);
                throw accessTokenInvalid();
            },
        ).catch((err) => {
            console.error("Call to access_token_v2 failed with: ", JSON.stringify(err));
            throw err;
        });
    }
}
