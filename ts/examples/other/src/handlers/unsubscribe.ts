import { Response } from "express";
import { WithBotClient } from "../types";
import { ping } from "./ping";
import { success } from "./success";

export default async function (req: WithBotClient, res: Response) {
  const client = req.botClient;

  const msg = (
    await client.createTextMessage(
      "Unsubscribing from autonomous behaviour ..."
    )
  )
    .setFinalised(true)
    .makeEphemeral();

  if (client.scope.isChatScope()) {
    ping.unsubscribe(client.scope);
  }

  res.status(200).json(success(msg));
}
