import { Response } from "express";
import { handleSummariseCommand } from "../services/openai";
import { WithBotClient } from "../types";
import { ephemeralMsg } from "./helpers";
import { success } from "./success";

export default async function summarise(req: WithBotClient, res: Response) {
    const client = req.botClient;

    try {
        const prompt = client.stringArg("prompt");

        if (prompt === undefined) {
            res.status(200).json(
                success(
                    await ephemeralMsg(
                        client,
                        "⚠️ Invalid prompt. Please provide a description like 'last 200 messages' or 'summarize recent activity'.",
                    ),
                ),
            );
            return;
        }

        const placeholder = (
            await client.createTextMessage("🔍 Analyzing messages...")
        ).setFinalised(false);
        res.status(200).json(success(placeholder));

        const summary = await handleSummariseCommand(client, prompt);

        const finalMsg = (await client.createTextMessage(`📊 **Chat Summary**\n\n${summary}`))
            .setFinalised(true)
            .setBlockLevelMarkdown(true);

        client.sendMessage(finalMsg).catch((err) => console.error("Failed to send summary:", err));
    } catch (error) {
        console.error("Error in summarise handler:", error);

        res.status(200).json(
            success(
                await ephemeralMsg(
                    client,
                    "❌ **Error**\n\nFailed to generate summary. Please try again or contact support if the issue persists.",
                ),
            ),
        );
        return;
    }
}
