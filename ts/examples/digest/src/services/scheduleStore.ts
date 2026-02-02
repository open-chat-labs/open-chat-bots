import { ScheduleConfig } from "../types";

/**
 * Storage abstraction for schedule configurations
 * In a *real* implementation this would have to be persisted in some reliable way rather than held in memory
 */
export interface ScheduleStore {
    get(location: string): Promise<ScheduleConfig | undefined>;
    set(location: string, config: ScheduleConfig): Promise<void>;
    delete(location: string): Promise<void>;
    getAll(): Promise<Map<string, ScheduleConfig>>;
}

/**
 * In-memory implementation of ScheduleStore
 * Schedules are lost when the bot restarts
 */
export class InMemoryScheduleStore implements ScheduleStore {
    private schedules = new Map<string, ScheduleConfig>();

    get(location: string): Promise<ScheduleConfig | undefined> {
        return Promise.resolve(this.schedules.get(location));
    }

    set(location: string, config: ScheduleConfig): Promise<void> {
        this.schedules.set(location, config);
        console.log(`Stored schedule for ${location}:`, config);
        return Promise.resolve();
    }

    delete(location: string): Promise<void> {
        const existed = this.schedules.delete(location);
        if (existed) {
            console.log(`Deleted schedule for ${location}`);
        }
        return Promise.resolve();
    }

    getAll(): Promise<Map<string, ScheduleConfig>> {
        return Promise.resolve(new Map(this.schedules));
    }
}
