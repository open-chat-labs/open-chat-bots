import type { HttpAgent } from "@dfinity/agent";
import { MsgpackCanisterAgent } from "../canisterAgent/msgpack";
import { StorageBucketUploadChunkResponse } from "../../typebox/typebox";
export declare class StorageBucketClient extends MsgpackCanisterAgent {
    constructor(agent: HttpAgent, canisterId: string);
    uploadChunk(fileId: bigint, hash: Uint8Array, mimeType: string, accessors: string[], totalSize: bigint, chunkSize: number, chunkIndex: number, bytes: Uint8Array, expiryTimestampMillis: bigint | undefined): Promise<StorageBucketUploadChunkResponse>;
}
