import { Response } from "express";
import { WithBotClient } from "../types";
import { success } from "./success";
import { ephemeralMsg } from "./helpers";

export async function ephemeral(req: WithBotClient, res: Response) {
    const client = req.botClient;

    res.status(200).json(
        success(
            await ephemeralMsg(
                client,
                "This is a just a test of ephemeral messages",
            ),
        ),
    );
}
