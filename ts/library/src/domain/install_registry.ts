import { InstallationRecord, type InstallationLocation } from "./bot";

export class InstallationRegistry {
    #map: Map<string, InstallationRecord>;

    constructor(map?: Map<string, InstallationRecord>) {
        this.#map = map ?? new Map();
    }

    set(location: InstallationLocation, record: InstallationRecord) {
        this.#map.set(JSON.stringify(location), record);
    }

    delete(location: InstallationLocation): boolean {
        return this.#map.delete(JSON.stringify(location));
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
