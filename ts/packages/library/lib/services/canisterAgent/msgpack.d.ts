import { HttpAgent } from "@dfinity/agent";
import type { Static, TSchema } from "@sinclair/typebox";
import { CanisterAgent } from "./base";
export declare abstract class MsgpackCanisterAgent extends CanisterAgent {
    constructor(agent: HttpAgent, canisterId: string);
    protected executeMsgpackQuery<In extends TSchema, Resp extends TSchema, Out>(methodName: string, args: Static<In>, mapper: (from: Static<Resp>) => Out | Promise<Out>, requestValidator: In, responseValidator: Resp): Promise<Out>;
    protected executeMsgpackUpdate<In extends TSchema, Resp extends TSchema, Out>(methodName: string, args: Static<In>, mapper: (from: Static<Resp>) => Out | Promise<Out>, requestValidator: In, responseValidator: Resp): Promise<Out>;
    private static validate;
    private static prepareMsgpackArgs;
    private static processMsgpackResponse;
}
