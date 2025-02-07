import { HttpAgent } from "@dfinity/agent";
import type { Static, TSchema } from "@sinclair/typebox";
import { CanisterAgent } from "./base";
export declare abstract class JsonCanisterAgent extends CanisterAgent {
    constructor(agent: HttpAgent, canisterId: string);
    protected executeJsonQuery<In extends TSchema, Resp extends TSchema, Out>(methodName: string, args: Static<In>, mapper: (from: Static<Resp>) => Out | Promise<Out>, requestValidator: In, responseValidator: Resp): Promise<Out>;
    protected executeJsonUpdate<In extends TSchema, Resp extends TSchema, Out>(methodName: string, args: Static<In>, mapper: (from: Static<Resp>) => Out | Promise<Out>, requestValidator: In, responseValidator: Resp): Promise<Out>;
    private static validate;
    private static prepareArgs;
    private static processResponse;
}
