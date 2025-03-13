import { Response } from "express";
import { ping } from "./ping";
import { success } from "./success";
import { WithBotClient } from "../types";

export default async function (req: WithBotClient, res: Response) {
  const client = req.botClient;

  const msg = (
    await client.createTextMessage(
      "Unsubscribing from autonomous behaviour ..."
    )
  )
    .setFinalised(true)
    .makeEphemeral();

  ping.unsubscribe(client.scope);

  res.status(200).json(success(msg));
}
