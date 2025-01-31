import type { HttpAgent } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { sha3_256 } from "js-sha3";
import { random128 } from "../../utils/rng";
import type { ProjectedAllowance } from "../storageIndex/candid/types";
import { StorageIndexClient } from "../storageIndex/storageIndex.client";
import { StorageBucketClient } from "../storageBucket/storageBucket.client";
import type { BotClientConfig } from "../../types";

export type BlobReference = {
    blobId: bigint;
    canisterId: string;
};

export type UploadFileResponse = {
    canisterId: string;
    fileId: bigint;
    pathPrefix: string;
    projectedAllowance: ProjectedAllowance;
};

export class DataClient extends EventTarget {
    private storageIndexClient: StorageIndexClient;

    constructor(
        private agent: HttpAgent,
        private config: BotClientConfig,
    ) {
        super();
        this.storageIndexClient = new StorageIndexClient(
            agent,
            config.openStorageCanisterId,
            config.icHost,
        );
    }

    async uploadData(
        accessorCanisterIds: string[],
        mimeType: string,
        data: Uint8Array,
    ): Promise<BlobReference> {
        const accessorIds = accessorCanisterIds.map((c) => Principal.fromText(c));
        const response = await this.uploadFile(mimeType, accessorIds, data);
        return this.extractBlobReference(response);
    }

    extractBlobReference(response: UploadFileResponse): BlobReference {
        return {
            canisterId: response.canisterId.toString(),
            blobId: response.fileId,
        };
    }

    private async uploadFile(
        mimeType: string,
        accessors: Array<Principal>,
        bytes: ArrayBuffer,
        expiryTimestampMillis?: bigint,
    ): Promise<UploadFileResponse> {
        const hash = new Uint8Array(hashBytes(bytes));
        const fileSize = bytes.byteLength;

        const allocatedBucketResponse = await this.storageIndexClient.allocatedBucket(
            hash,
            BigInt(fileSize),
            random128(),
        );

        if (!("Success" in allocatedBucketResponse)) {
            // TODO make this better!
            throw new Error(JSON.stringify(allocatedBucketResponse));
        }

        const bucketCanisterId = allocatedBucketResponse.Success.canister_id.toString();
        const fileId = allocatedBucketResponse.Success.file_id;
        const chunkSize = allocatedBucketResponse.Success.chunk_size;
        const chunkCount = Math.ceil(fileSize / chunkSize);
        const chunkIndexes = [...Array(chunkCount).keys()];
        const bucketClient = new StorageBucketClient(
            this.agent,
            bucketCanisterId,
            this.config.icHost,
        );

        let chunksCompleted = 0;

        const promises = chunkIndexes.map(async (chunkIndex) => {
            const start = chunkIndex * chunkSize;
            const end = Math.min(start + chunkSize, fileSize);
            const chunkBytes = new Uint8Array(bytes.slice(start, end));

            let attempt = 0;

            while (attempt++ < 5) {
                try {
                    const chunkResponse = await bucketClient.uploadChunk(
                        fileId,
                        hash,
                        mimeType,
                        accessors,
                        BigInt(fileSize),
                        chunkSize,
                        chunkIndex,
                        chunkBytes,
                        expiryTimestampMillis,
                    );

                    if ("Success" in chunkResponse) {
                        chunksCompleted++;
                        return;
                    }
                } catch (e) {
                    console.log("Error uploading chunk " + chunkIndex, e);
                }
            }
            throw new Error("Failed to upload chunk");
        });

        await Promise.all(promises);

        return {
            canisterId: bucketCanisterId,
            fileId,
            pathPrefix: "/files/",
            projectedAllowance: allocatedBucketResponse.Success.projected_allowance,
        };
    }
}

function hashBytes(bytes: ArrayBuffer): ArrayBuffer {
    const hash = sha3_256.create();
    hash.update(bytes);
    return hash.arrayBuffer();
}
