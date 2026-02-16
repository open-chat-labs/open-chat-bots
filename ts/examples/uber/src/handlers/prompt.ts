import { Response } from "express";
import { handleCommand } from "../services/openai";
import { WithBotClient } from "../types";
import { ephemeralMsg } from "./helpers";
import { success } from "./success";

/**
 * find all recent messages that mention dogs and react with an dog emoji
 */

export default async function prompt(req: WithBotClient, res: Response) {
    const client = req.botClient;

    try {
        const prompt = client.stringArg("prompt");

        if (prompt === undefined) {
            res.status(200).json(
                success(
                    await ephemeralMsg(
                        client,
                        "⚠️ Invalid prompt. Please tell me what you want me to do.",
                    ),
                ),
            );
            return;
        }

        const placeholder = (await client.createTextMessage("🤔 Thinking...")).setFinalised(false);
        res.status(200).json(success(placeholder));

        const answer = await handleCommand(client, prompt);

        const finalMsg = (await client.createTextMessage(answer))
            .setFinalised(true)
            .setBlockLevelMarkdown(true);

        client.sendMessage(finalMsg).catch((err) => console.error("Failed to send answer:", err));
    } catch (error) {
        console.error("Error handling user query:", error);

        res.status(200).json(
            success(
                await ephemeralMsg(
                    client,
                    "Sorry something went wrong and I couldn't answer your question",
                ),
            ),
        );
        return;
    }
}
