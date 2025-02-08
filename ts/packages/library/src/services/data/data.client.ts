import type { HttpAgent } from "@dfinity/agent";
import { sha3_256 } from "js-sha3";
import { random128 } from "../../utils/rng";
import { StorageIndexClient } from "../storageIndex/storageIndex.client";
import { StorageBucketClient } from "../storageBucket/storageBucket.client";
import type { BlobReference, BotClientConfig } from "../../domain";
import type { StorageIndexProjectedAllowance } from "../../typebox/typebox";
import { principalBytesToString } from "../../mapping";

export type UploadFileResponse = {
    canisterId: string;
    fileId: bigint;
    pathPrefix: string;
    projectedAllowance: StorageIndexProjectedAllowance;
};

export class DataClient extends EventTarget {
    private storageIndexClient: StorageIndexClient;

    constructor(
        private agent: HttpAgent,
        config: BotClientConfig,
    ) {
        super();
        this.storageIndexClient = new StorageIndexClient(agent, config.openStorageCanisterId);
    }

    async uploadData(
        accessorCanisterIds: string[],
        mimeType: string,
        data: Uint8Array,
    ): Promise<BlobReference> {
        const response = await this.uploadFile(mimeType, accessorCanisterIds, data);
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
        accessors: string[],
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

        if (
            !(typeof allocatedBucketResponse === "object" && "Success" in allocatedBucketResponse)
        ) {
            throw new Error(JSON.stringify(allocatedBucketResponse));
        }

        const bucketCanisterId = principalBytesToString(
            allocatedBucketResponse.Success.canister_id,
        );
        const fileId = allocatedBucketResponse.Success.file_id;
        const chunkSize = allocatedBucketResponse.Success.chunk_size;
        const chunkCount = Math.ceil(fileSize / chunkSize);
        const chunkIndexes = [...Array(chunkCount).keys()];
        const bucketClient = new StorageBucketClient(this.agent, bucketCanisterId);

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

                    if (chunkResponse === "Success") {
                        chunksCompleted++;
                        return;
                    }
                } catch (e) {
                    console.error("Error uploading chunk " + chunkIndex, e);
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
