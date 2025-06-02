import type { HttpAgent } from "@dfinity/agent";
import { MsgpackCanisterAgent } from "../canisterAgent/msgpack";
import {
    StorageIndexAllocationBucketArgs,
    StorageIndexAllocationBucketResponse,
} from "../../typebox/typebox";

export class StorageIndexClient extends MsgpackCanisterAgent {
    constructor(agent: HttpAgent, canisterId: string) {
        super(agent, canisterId);
    }

    allocatedBucket(
        fileHash: Uint8Array,
        fileSize: bigint,
        fileIdSeed: bigint | undefined,
    ): Promise<StorageIndexAllocationBucketResponse> {
        return this.executeMsgpackQuery(
            "allocated_bucket_v2",
            {
                file_hash: Array.from(
                    fileHash,
                ) as typeof StorageIndexAllocationBucketArgs.file_hash,
                file_size: fileSize,
                file_id_seed: fileIdSeed,
            },
            (resp) => resp,
            StorageIndexAllocationBucketArgs,
            StorageIndexAllocationBucketResponse,
        );
    }
}
