import type { HttpAgent } from "@dfinity/agent";
import type { Principal } from "@dfinity/principal";
import { type CandidUploadChunkResponse } from "./candid/idl";
import { CandidService } from "../../utils/candidService";
export declare class StorageBucketClient extends CandidService {
    private service;
    constructor(agent: HttpAgent, canisterId: string, icHost: string);
    uploadChunk(fileId: bigint, hash: Uint8Array, mimeType: string, accessors: Array<Principal>, totalSize: bigint, chunkSize: number, chunkIndex: number, bytes: Uint8Array, expiryTimestampMillis: bigint | undefined): Promise<CandidUploadChunkResponse>;
}
