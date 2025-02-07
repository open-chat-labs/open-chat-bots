import { HttpAgent } from "@dfinity/agent";
export declare abstract class CanisterAgent {
    protected agent: HttpAgent;
    protected canisterId: string;
    constructor(agent: HttpAgent, canisterId: string);
    protected executeQuery<From, To>(serviceCall: () => Promise<From>, mapper: (from: From) => To | Promise<To>, args?: unknown, retries?: number): Promise<To>;
}
