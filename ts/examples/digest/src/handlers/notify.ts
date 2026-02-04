import {
    BotClient,
    BotEvent,
    handleNotification,
    InstallationRecord,
} from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";
import { factory } from "../factory";
import { DigestScheduler } from "../services/scheduler";

export async function notify(req: Request, res: Response, scheduler: DigestScheduler) {
    console.log("Notification received: ", req.body);
    handleNotification(
        req.headers["x-oc-signature"] as string,
        req.body as Buffer,
        factory,
        async (_: BotClient, ev: BotEvent, timestamp: bigint, apiGateway: string) => {
            // Handle bot installation/uninstallation events
            if (ev.kind === "bot_installed_event") {
                await scheduler.install(
                    ev.location,
                    new InstallationRecord(
                        apiGateway,
                        ev.grantedAutonomousPermissions,
                        ev.grantedCommandPermissions,
                        timestamp,
                    ),
                );
            } else if (ev.kind === "bot_uninstalled_event") {
                await scheduler.uninstall(ev.location, timestamp);
            }

            res.status(200).json({});
        },
        (err) => {
            console.error("Error handling notification:", err);
            res.status(500).json({ error: err });
        },
    );
}
