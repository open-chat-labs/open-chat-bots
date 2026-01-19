import { type UserSummary } from "@open-ic/openchat-botclient-ts";
import { Response } from "express";
import { factory } from "../factory";
import { WithBotClient } from "../types";
import { success } from "./success";

export default async function (req: WithBotClient, res: Response) {
    const resp = await factory.createUserIndexClient().userSummary(req.botClient.initiator!);

    const client = req.botClient;
    if (resp.kind === "success") {
        const msg = createSuccessMessage(resp.user);
        const details = (await client.createTextMessage(msg)).setFinalised(true);
        client.sendMessage(details).catch((err) => console.error("sendMessage failed with: ", err));
        res.status(200).json(success(details));
    } else {
        const error = (
            await client.createTextMessage("Hmmm sorry we couldn't load the user summary")
        )
            .setFinalised(true)
            .makeEphemeral();
        res.status(200).json(success(error));
    }
}

function createSuccessMessage(summary: UserSummary): string {
    return `
        UserId: ${summary.userId}
        Username: ${summary.username}
        DisplayName: ${summary.displayName}
        Suspended: ${summary.suspended}
        DiamondStatus: ${summary.diamondStatus}
        ChitBalance: ${summary.chitBalance}
        TotalChitEarned: ${summary.totalChitEarned}
        Streak: ${summary.streak}
        MaxStreak: ${summary.maxStreak}
        IsUniquePerson: ${summary.isUniquePerson}
    `;
}
