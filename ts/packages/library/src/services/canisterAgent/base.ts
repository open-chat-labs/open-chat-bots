import { HttpAgent } from "@dfinity/agent";
import {
    AuthError,
    DestinationInvalidError,
    ReplicaNotUpToDateError,
    ResponseTooLargeError,
    toCanisterResponseError,
} from "../../utils/error";

const MAX_RETRIES = process.env.NODE_ENV === "production" ? 7 : 3;
const RETRY_DELAY = 100;

function debug(msg: string): void {
    console.debug(msg);
}

export abstract class CanisterAgent {
    constructor(
        protected agent: HttpAgent,
        protected canisterId: string,
    ) {}

    protected executeQuery<From, To>(
        serviceCall: () => Promise<From>,
        mapper: (from: From) => To | Promise<To>,
        args?: unknown,
        retries = 0,
    ): Promise<To> {
        return serviceCall()
            .then(mapper)
            .catch((err) => {
                const responseErr = toCanisterResponseError(err as Error);
                const debugInfo = `error: ${JSON.stringify(
                    responseErr,
                    Object.getOwnPropertyNames(responseErr),
                )}, args: ${JSON.stringify(args)}`;
                if (
                    !(responseErr instanceof ResponseTooLargeError) &&
                    !(responseErr instanceof DestinationInvalidError) &&
                    !(responseErr instanceof AuthError) &&
                    retries < MAX_RETRIES
                ) {
                    const delay = RETRY_DELAY * Math.pow(2, retries);

                    if (responseErr instanceof ReplicaNotUpToDateError) {
                        debug(
                            `query: replica not up to date, retrying in ${delay}ms. retries: ${retries}. ${debugInfo}`,
                        );
                    } else {
                        debug(
                            `query: error occurred, retrying in ${delay}ms. retries: ${retries}. ${debugInfo}`,
                        );
                    }

                    return new Promise((resolve, reject) => {
                        setTimeout(() => {
                            this.executeQuery(serviceCall, mapper, args, retries + 1)
                                .then(resolve)
                                .catch(reject);
                        }, delay);
                    });
                } else {
                    debug(
                        `query: Error performing query request, exiting retry loop. retries: ${retries}. ${debugInfo}`,
                    );
                    throw responseErr;
                }
            });
    }
}
