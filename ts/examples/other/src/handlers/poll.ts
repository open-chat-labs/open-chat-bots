import { Response } from "express";
import { success } from "./success";
import { WithBotClient } from "../types";

export default async function (req: WithBotClient, res: Response) {
  const client = req.botClient;
  const msg = await client.createPollMessage("Do you like OpenChat?", [
    "Oh yes I certainly do!",
    "No not at all. Frightful.",
  ]);

  client
    .sendMessage(msg)
    .catch((err: unknown) =>
      console.error("sendPollMessage failed with: ", err)
    );

  res.status(200).json(success(msg));
}
