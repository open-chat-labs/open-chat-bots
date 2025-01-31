import { Actor, HttpAgent } from "@dfinity/agent";
import type { IDL } from "@dfinity/candid";
import { toCanisterResponseError } from "./error";

export abstract class CandidService {
    static createServiceClient<T>(
        factory: IDL.InterfaceFactory,
        canisterId: string,
        host: string,
        agent: HttpAgent,
    ): T {
        const isMainnet = host.includes("icp-api.io");
        if (!isMainnet) {
            agent.fetchRootKey();
        }
        return Actor.createActor<T>(factory, {
            agent,
            canisterId,
        });
    }

    static handleResponse<From, To>(
        service: Promise<From>,
        mapper: (from: From) => To,
        args?: unknown,
    ): Promise<To> {
        return service.then(mapper).catch((err) => {
            console.log(err, args);
            throw toCanisterResponseError(err as Error);
        });
    }

    constructor() {}
}
