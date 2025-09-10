import {
    BotClient,
    BotEvent,
    handleNotification,
    InstallationRecord,
} from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";
import { factory } from "../factory";
import { ping } from "./ping";

export async function notify(req: Request, res: Response) {
    handleNotification(
        req.headers["x-oc-signature"] as string,
        req.body as Buffer,
        factory,
        async (_: BotClient, ev: BotEvent, apiGateway: string) => {
            if (ev.kind === "bot_installed_event") {
                ping.install(
                    ev.location,
                    new InstallationRecord(
                        apiGateway,
                        ev.grantedAutonomousPermissions,
                        ev.grantedCommandPermissions,
                    ),
                );
            }
            res.status(200).json({});
        },
        (err) => {
            res.status(500).json({ error: err });
        },
    );
}
