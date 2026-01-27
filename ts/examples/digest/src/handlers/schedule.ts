import { chatIdentifierToInstallationLocation } from "@open-ic/openchat-botclient-ts";
import { Response } from "express";
import { handleScheduleCommand } from "../services/openai";
import { DigestScheduler } from "../services/scheduler";
import { WithBotClient } from "../types";
import { ephemeralMsg } from "./helpers";
import { success } from "./success";

export default async function schedule(
    req: WithBotClient,
    res: Response,
    scheduler: DigestScheduler,
) {
    const client = req.botClient;

    try {
        const prompt = client.stringArg("prompt");

        if (prompt === undefined) {
            res.status(200).json(
                success(
                    await ephemeralMsg(
                        client,
                        "⚠️ Invalid prompt. Please provide a schedule like 'last 200 messages every morning' or 'summarize 100 messages every Monday at 2pm'.",
                    ),
                ),
            );
            return;
        }

        const placeholder = (
            await client.createTextMessage("⏰ Setting up schedule...")
        ).setFinalised(false);
        res.status(200).json(success(placeholder));

        const scope = client.scope;
        if (!scope.isChatScope()) {
            res.status(200).json(
                success(
                    await ephemeralMsg(client, "❌ Scheduling is only supported in chat contexts."),
                ),
            );
            return;
        }

        const location = chatIdentifierToInstallationLocation(scope.chat);

        const response = await handleScheduleCommand(client, prompt, scheduler, location);

        const finalMsg = (
            await client.createTextMessage(`✅ **Schedule Configured**\n\n${response}`)
        )
            .setFinalised(true)
            .setBlockLevelMarkdown(true);

        client
            .sendMessage(finalMsg)
            .catch((err) => console.error("Failed to send confirmation:", err));
    } catch (error) {
        console.error("Error in schedule handler:", error);

        res.status(200).json(
            success(
                await ephemeralMsg(
                    client,
                    "❌ **Error**\n\nFailed to set up schedule. Please ensure the bot has the necessary permissions and try again.",
                ),
            ),
        );
        return;
    }
}
