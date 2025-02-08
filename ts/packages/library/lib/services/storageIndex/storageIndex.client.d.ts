import type { HttpAgent } from "@dfinity/agent";
import { MsgpackCanisterAgent } from "../canisterAgent/msgpack";
import { StorageIndexAllocationBucketResponse } from "../../typebox/typebox";
export declare class StorageIndexClient extends MsgpackCanisterAgent {
    constructor(agent: HttpAgent, canisterId: string);
    allocatedBucket(fileHash: Uint8Array, fileSize: bigint, fileIdSeed: bigint | undefined): Promise<StorageIndexAllocationBucketResponse>;
}
