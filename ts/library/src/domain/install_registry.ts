import { InstallationRecord, type InstallationLocation } from "./bot";

export class InstallationRegistry {
    #map: Map<string, InstallationRecord>;

    constructor(map?: Map<string, InstallationRecord>) {
        this.#map = map ?? new Map();
    }

    set(location: InstallationLocation, newRecord: InstallationRecord) {
        const key = JSON.stringify(location);
        const record = this.#map.get(key);

        if (record !== undefined && newRecord.lastUpdated <= record.lastUpdated) {
            return;
        }

        this.#map.set(key, newRecord);
    }

    delete(location: InstallationLocation, timestamp: bigint): boolean {
        const key = JSON.stringify(location);
        const record = this.#map.get(key);
        if (record !== undefined && record.lastUpdated < timestamp) {
            return this.#map.delete(key);
        } else {
            return false;
        }
    }

    get(location: InstallationLocation): InstallationRecord | undefined {
        return this.#map.get(JSON.stringify(location));
    }

    toMap(): Map<string, string> {
        return new Map<string, string>([...this.#map.entries()].map(([k, v]) => [k, v.toString()]));
    }

    static fromMap(map: Map<string, string>): InstallationRegistry {
        const reg = new Map<string, InstallationRecord>(
            [...map.entries()].map(([k, v]) => [k, InstallationRecord.fromString(v)]),
        );
        return new InstallationRegistry(reg);
    }
}
