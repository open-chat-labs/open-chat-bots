import type { HttpAgent } from "@dfinity/agent";
import type { BlobReference, BotClientConfig } from "../../domain";
import type { StorageIndexProjectedAllowance } from "../../typebox/typebox";
export type UploadFileResponse = {
    canisterId: string;
    fileId: bigint;
    pathPrefix: string;
    projectedAllowance: StorageIndexProjectedAllowance;
};
export declare class DataClient extends EventTarget {
    private agent;
    private storageIndexClient;
    constructor(agent: HttpAgent, config: BotClientConfig);
    uploadData(accessorCanisterIds: string[], mimeType: string, data: Uint8Array): Promise<BlobReference>;
    extractBlobReference(response: UploadFileResponse): BlobReference;
    private uploadFile;
}
