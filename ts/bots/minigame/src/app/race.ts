// What the races' views share: the lobby, which says what the race is and who can change its
// settings, and the header's clock
import type { RaceBase } from "../games/race";
import type { SettingSpec } from "../games/settings";
import { mmss } from "./format";
import type { Lobby } from "./view";

/** A race's lobby: what it is, as HTML, who's joined, and the host's settings */
export function raceLobby(
    s: RaceBase<string>,
    race: { blurb: string; settings: readonly SettingSpec[]; maxPlayers: number; verb?: string },
): Lobby {
    return {
        blurb: race.blurb,
        seats: s.seats,
        hint: `Start when everyone has joined. Up to ${race.maxPlayers} can ${race.verb ?? "race"}.`,
        settings: {
            specs: race.settings,
            current: s.settings,
            host: s.host,
            hostName: s.hostName,
        },
    };
}

/** The header's clock: the time left while the race is on, and how long it took once it's over */
export function raceClock(s: RaceBase<string> | undefined): string {
    if (s?.startedAt === undefined) return "";
    // Rounded once it's over, as the result is, eg. "in 1m 12s"
    if (s.phase === "finished") return mmss((s.finishedAt ?? Date.now()) - s.startedAt, Math.round);
    return s.endsAt === undefined ? "" : `${mmss(s.endsAt - Date.now())} left`;
}
