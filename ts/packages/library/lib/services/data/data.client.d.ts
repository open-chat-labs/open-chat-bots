import type { HttpAgent } from "@dfinity/agent";
import type { ProjectedAllowance } from "../storageIndex/candid/types";
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
export declare class DataClient extends EventTarget {
    private agent;
    private config;
    private storageIndexClient;
    constructor(agent: HttpAgent, config: BotClientConfig);
    uploadData(accessorCanisterIds: string[], mimeType: string, data: Uint8Array): Promise<BlobReference>;
    extractBlobReference(response: UploadFileResponse): BlobReference;
    private uploadFile;
}
