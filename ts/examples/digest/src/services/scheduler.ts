import {
    BotClientFactory,
    ChatActionScope,
    chatIdentifierToInstallationLocation,
    InstallationLocation,
    InstallationRecord,
    InstallationRegistry,
} from "@open-ic/openchat-botclient-ts";
import * as cron from "node-cron";
import { ScheduleConfig } from "../types";
import { handleSummariseCommand } from "./openai";
import { ScheduleStore } from "./scheduleStore";

/**
 * Manages scheduled digest summaries
 * Similar to the Ping class from the "other" bot example
 */
export class DigestScheduler {
    private installs = new InstallationRegistry();
    private scheduledTasks = new Map<string, cron.ScheduledTask | NodeJS.Timeout>();

    constructor(
        private factory: BotClientFactory,
        private store: ScheduleStore,
    ) {}

    /**
     * Schedule a digest summary for a specific installation location
     */
    async scheduleDigest(location: InstallationLocation, config: ScheduleConfig): Promise<boolean> {
        const locationStr = location.toString();

        // Check if we have this installation
        const installation = this.installs.get(location);
        if (!installation) {
            console.error("No installation found for location:", locationStr);
            return false;
        }

        // Check permissions
        if (!installation.grantedAutonomousPermissions.hasMessagePermission("Text")) {
            console.error("Missing Text message permission for location:", locationStr);
            return false;
        }

        // Cancel existing task if any (but don't delete from store yet)
        const existingTask = this.scheduledTasks.get(locationStr);
        if (existingTask) {
            if (typeof existingTask === "object" && "stop" in existingTask) {
                existingTask.stop();
            } else {
                clearInterval(existingTask as NodeJS.Timeout);
            }
            this.scheduledTasks.delete(locationStr);
        }

        // Store the schedule config (after canceling old task but before creating new one)
        await this.store.set(locationStr, config);

        // Create new scheduled task based on frequency
        try {
            let task: cron.ScheduledTask | NodeJS.Timeout;

            if (config.frequency === "interval" && config.intervalHours) {
                // Use setInterval for interval-based schedules
                const intervalMs = config.intervalHours * 60 * 60 * 1000;
                task = setInterval(() => {
                    this.executeSummary(locationStr).catch((err) =>
                        console.error("Error executing scheduled summary:", err),
                    );
                }, intervalMs);
            } else if (config.frequency === "daily" && config.time) {
                // Use node-cron for daily schedules
                const [hour, minute] = config.time.split(":");
                const cronExpression = `${minute} ${hour} * * *`;
                task = cron.schedule(cronExpression, () => {
                    this.executeSummary(locationStr).catch((err) =>
                        console.error("Error executing scheduled summary:", err),
                    );
                });
            } else if (
                config.frequency === "weekly" &&
                config.dayOfWeek !== undefined &&
                config.time
            ) {
                // Use node-cron for weekly schedules
                const [hour, minute] = config.time.split(":");
                const cronExpression = `${minute} ${hour} * * ${config.dayOfWeek}`;
                task = cron.schedule(cronExpression, () => {
                    this.executeSummary(locationStr).catch((err) =>
                        console.error("Error executing scheduled summary:", err),
                    );
                });
            } else {
                console.error("Invalid schedule configuration:", config);
                return false;
            }

            this.scheduledTasks.set(locationStr, task);
            console.log(`Scheduled digest for ${locationStr}:`, config);
            return true;
        } catch (error) {
            console.error("Error scheduling digest:", error);
            return false;
        }
    }

    /**
     * Remove scheduled digest for a location
     */
    async unscheduleDigest(location: InstallationLocation): Promise<boolean> {
        const locationStr = location.toString();
        const task = this.scheduledTasks.get(locationStr);

        if (task) {
            if (typeof task === "object" && "stop" in task) {
                task.stop();
            } else {
                clearInterval(task as NodeJS.Timeout);
            }
            this.scheduledTasks.delete(locationStr);
            await this.store.delete(locationStr);
            console.log(`Unscheduled digest for ${locationStr}`);
            return true;
        }

        return false;
    }

    /**
     * Register a bot installation
     */
    async install(location: InstallationLocation, record: InstallationRecord) {
        this.installs.set(location, record);
        console.log("Installed bot in location:", location.toString());

        // Restore any existing schedule for this location
        const config = await this.store.get(location.toString());
        if (config) {
            console.log("Restoring schedule for", location.toString());
            await this.scheduleDigest(location, config);
        }
    }

    /**
     * Unregister a bot installation
     */
    async uninstall(location: InstallationLocation, uninstalledAt: bigint) {
        await this.unscheduleDigest(location);
        this.installs.delete(location, uninstalledAt);
        console.log("Uninstalled bot from location:", location.toString());
    }

    /**
     * Start the scheduler (load installations and restore schedules)
     */
    async start() {
        console.log("Starting DigestScheduler...");
        await this.loadInstallations();
        await this.restoreSchedules();
    }

    /**
     * Restore all schedules from storage
     */
    private async restoreSchedules() {
        console.log("Restoring schedules from storage...");
        const allSchedules = await this.store.getAll();

        for (const [locationStr, config] of allSchedules) {
            try {
                // Parse location string to get InstallationLocation
                const scope = ChatActionScope.fromString(locationStr);
                if (!scope.isChatScope()) {
                    console.error("Invalid scope in stored schedule:", locationStr);
                    continue;
                }

                const location = chatIdentifierToInstallationLocation(scope.chat);

                // Check if we have this installation
                const installation = this.installs.get(location);
                if (!installation) {
                    console.log(`Skipping schedule for ${locationStr} - installation not found`);
                    continue;
                }

                // Recreate the scheduled task
                console.log(`Restoring schedule for ${locationStr}:`, config);
                this.scheduleDigest(location, config);
            } catch (error) {
                console.error(`Error restoring schedule for ${locationStr}:`, error);
            }
        }

        console.log(`Restored ${allSchedules.size} schedules`);
    }

    /**
     * Stop the scheduler (cancel all tasks)
     */
    stop() {
        console.log("Stopping DigestScheduler...");
        for (const [location, task] of this.scheduledTasks) {
            if (typeof task === "object" && "stop" in task) {
                task.stop();
            } else {
                clearInterval(task as NodeJS.Timeout);
            }
            console.log("Stopped task for", location);
        }
        this.scheduledTasks.clear();
    }

    /**
     * Execute a scheduled summary
     */
    private async executeSummary(locationStr: string): Promise<void> {
        console.log(`Executing scheduled summary for ${locationStr}`);

        try {
            // Get schedule config
            const config = await this.store.get(locationStr);
            if (!config) {
                console.error("No schedule config found for", locationStr);
                return;
            }

            // Parse location to get scope
            const scope = ChatActionScope.fromString(locationStr);
            if (!scope.isChatScope()) {
                console.error("Invalid scope for scheduled summary:", locationStr);
                return;
            }

            // Get installation
            const location = chatIdentifierToInstallationLocation(scope.chat);
            const installation = this.installs.get(location);
            if (!installation) {
                console.error("No installation found for", locationStr);
                return;
            }

            // Create autonomous client
            const client = this.factory.createClientInAutonomouseContext(
                scope,
                installation.apiGateway,
                installation.grantedAutonomousPermissions,
            );

            // Generate summary using the same logic as /summarise command
            const prompt = `Summarize the last ${config.messageCount} messages`;
            const summary = await handleSummariseCommand(client, prompt);

            // Send summary message
            const msg = (
                await client.createTextMessage(`📊 **Scheduled Digest Summary**\n\n${summary}`)
            )
                .setBlockLevelMarkdown(true)
                .setFinalised(true);

            await client.sendMessage(msg);
            console.log(`Successfully sent scheduled summary to ${locationStr}`);
        } catch (error) {
            console.error(`Error executing summary for ${locationStr}:`, error);

            // Try to send error message to chat
            try {
                const scope = ChatActionScope.fromString(locationStr);
                if (scope.isChatScope()) {
                    const location = chatIdentifierToInstallationLocation(scope.chat);
                    const installation = this.installs.get(location);
                    if (installation) {
                        const client = this.factory.createClientInAutonomouseContext(
                            scope,
                            installation.apiGateway,
                            installation.grantedAutonomousPermissions,
                        );

                        const errorMsg = await client.createTextMessage(
                            `⚠️ **Scheduled Digest Error**\n\nFailed to generate scheduled summary. The error has been logged.`,
                        );
                        await client.sendMessage(errorMsg);
                    }
                }
            } catch (sendError) {
                console.error("Could not send error message:", sendError);
            }
        }
    }

    /**
     * Load installation events from user index
     */
    private loadInstallations(): Promise<boolean> {
        return this.factory
            .createGlobalClient()
            .installationEvents()
            .then((resp) => {
                if (resp.kind === "success") {
                    for (const event of resp.events) {
                        switch (event.kind) {
                            case "installed":
                                this.install(
                                    event.location,
                                    new InstallationRecord(
                                        event.apiGateway,
                                        event.grantedAutonomousPermissions,
                                        event.grantedCommandPermissions,
                                        event.installedAt,
                                    ),
                                );
                                break;
                            case "uninstalled":
                                this.uninstall(event.location, event.uninstalledAt);
                                break;
                        }
                    }
                    console.log(`Loaded ${resp.events.length} installation events from user index`);
                    return true;
                } else {
                    console.log("Failed to load installations:", resp);
                    return false;
                }
            });
    }
}
