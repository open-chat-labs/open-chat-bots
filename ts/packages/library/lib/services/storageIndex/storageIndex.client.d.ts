import type { HttpAgent } from "@dfinity/agent";
import { type CandidAllocatedBucketResponse } from "./candid/idl";
import { CandidService } from "../../utils/candidService";
export declare class StorageIndexClient extends CandidService {
    private service;
    constructor(agent: HttpAgent, canisterId: string, icHost: string);
    allocatedBucket(fileHash: Uint8Array, fileSize: bigint, fileIdSeed: bigint | undefined): Promise<CandidAllocatedBucketResponse>;
}
