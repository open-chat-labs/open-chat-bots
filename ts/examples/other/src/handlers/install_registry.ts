import {
  InstallationLocation,
  InstallationRecord,
} from "@open-ic/openchat-botclient-ts";

export class InstallationRegistry {
  #map: Map<string, InstallationRecord> = new Map();

  register(location: InstallationLocation, record: InstallationRecord) {
    this.#map.set(JSON.stringify(location), record);
  }

  get(location: InstallationLocation): InstallationRecord | undefined {
    return this.#map.get(JSON.stringify(location));
  }
}
