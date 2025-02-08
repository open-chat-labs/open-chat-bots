import type { HttpAgent } from "@dfinity/agent";
import { MsgpackCanisterAgent } from "../canisterAgent/msgpack";
import {
    StorageBucketUploadChunkArgs,
    StorageBucketUploadChunkResponse,
} from "../../typebox/typebox";
import { principalStringToBytes } from "../../mapping";

export class StorageBucketClient extends MsgpackCanisterAgent {
    constructor(agent: HttpAgent, canisterId: string) {
        super(agent, canisterId);
    }

    uploadChunk(
        fileId: bigint,
        hash: Uint8Array,
        mimeType: string,
        accessors: string[],
        totalSize: bigint,
        chunkSize: number,
        chunkIndex: number,
        bytes: Uint8Array,
        expiryTimestampMillis: bigint | undefined,
    ): Promise<StorageBucketUploadChunkResponse> {
        return this.executeMsgpackUpdate(
            "upload_chunk_v2",
            {
                accessors: accessors.map(principalStringToBytes),
                chunk_index: chunkIndex,
                file_id: fileId,
                hash: Array.from(hash) as typeof StorageBucketUploadChunkArgs.hash,
                mime_type: mimeType,
                total_size: totalSize,
                bytes,
                chunk_size: chunkSize,
                expiry: expiryTimestampMillis,
            },
            (resp) => resp,
            StorageBucketUploadChunkArgs,
            StorageBucketUploadChunkResponse,
        );
    }
}
