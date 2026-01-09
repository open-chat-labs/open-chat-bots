import { PermissionRole } from "@open-ic/openchat-botclient-ts";
import { Response } from "express";
import { WithBotClient } from "../types";
import { ephemeralMsg } from "./helpers";
import { success } from "./success";

export default async function (req: WithBotClient, res: Response) {
    const client = req.botClient;
    const userId = client.userArg("User")!;
    const newRole = (client.stringArg("New role") ?? "member") as PermissionRole;

    const resp = await client.changeRole([userId], newRole);
    let message;
    if (resp.kind === "success") {
        message = "Role changed to " + newRole;
    } else {
        message = "Failed to change role " + JSON.stringify(resp);
    }

    res.status(200).json(success(await ephemeralMsg(client, message)));
}
