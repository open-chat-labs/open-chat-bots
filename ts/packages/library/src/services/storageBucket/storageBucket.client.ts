import type { HttpAgent } from "@dfinity/agent";
import type { Principal } from "@dfinity/principal";
import {
    idlFactory,
    type CandidUploadChunkResponse,
    type StorageBucketService,
} from "./candid/idl";
import { CandidService } from "../../utils/candidService";

export class StorageBucketClient extends CandidService {
    private service: StorageBucketService;

    constructor(agent: HttpAgent, canisterId: string, icHost: string) {
        super();

        this.service = CandidService.createServiceClient<StorageBucketService>(
            idlFactory,
            canisterId,
            icHost,
            agent,
        );
    }

    uploadChunk(
        fileId: bigint,
        hash: Uint8Array,
        mimeType: string,
        accessors: Array<Principal>,
        totalSize: bigint,
        chunkSize: number,
        chunkIndex: number,
        bytes: Uint8Array,
        expiryTimestampMillis: bigint | undefined,
    ): Promise<CandidUploadChunkResponse> {
        return CandidService.handleResponse(
            this.service.upload_chunk_v2({
                accessors,
                chunk_index: chunkIndex,
                file_id: fileId,
                hash,
                mime_type: mimeType,
                total_size: totalSize,
                bytes,
                chunk_size: chunkSize,
                expiry: expiryTimestampMillis !== undefined ? [expiryTimestampMillis] : [],
            }),
            (resp) => resp,
        );
    }
}
