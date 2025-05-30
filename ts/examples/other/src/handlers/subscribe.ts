import { Response } from "express";
import { ping } from "./ping";
import { success } from "./success";
import { WithBotClient } from "../types";

export default async function (req: WithBotClient, res: Response) {
  const client = req.botClient;
  if (!ping.subscribe(client.scope)) {
    const notSubscribed = (
      await client.createTextMessage(
        "We do not currently have an api key for this context"
      )
    )
      .setFinalised(true)
      .makeEphemeral();
    res.status(200).json(success(notSubscribed));
  } else {
    const subscribed = (
      await client.createTextMessage("Subscribed to autonomous behaviour!")
    )
      .setFinalised(true)
      .makeEphemeral();
    res.status(200).json(success(subscribed));
  }
}
