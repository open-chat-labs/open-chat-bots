// Ends races whose time is up, whether or not anyone's still playing: a move would end one, but a
// race nobody's moving in has to end on time too, and so does one that was running when the bot
// last stopped.
import type { Publisher } from "./publisher";
import type { GameStore } from "./store";

export const SWEEP_EVERY_MS = 1000;

/** Ends every race that's out of time and publishes its end. Returns how many ended. */
export function endRacesOutOfTime(store: GameStore, publisher: Publisher): number {
    let ended = 0;
    for (const { game, race } of store.entries()) {
        if (race.endIfTimeUp()) {
            ended++;
            publisher.publish(game);
        }
    }
    if (ended > 0) store.save();
    return ended;
}
