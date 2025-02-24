import { Response } from "express";
import { ping } from "./ping";
import { success } from "./success";
import { WithBotClient } from "../types";

export default async function (req: WithBotClient, res: Response) {
  const client = req.botClient;
  const msg = (
    await client.createTextMessage("Subscribing to autonomous behaviour...")
  ).setFinalised(false);

  client
    .sendMessage(msg)
    .catch((err: unknown) =>
      console.error("sendTextMessage failed with: ", err)
    );

  res.status(200).json(success(msg));

  if (!ping.subscribe(client.scope)) {
    const notSubscribed = (
      await client.createTextMessage(
        "We do not currently have an api key for this context"
      )
    ).setFinalised(true);
    client.sendMessage(notSubscribed);
  } else {
    const subscribed = (
      await client.createTextMessage("Subscribed to autonomous behaviour!")
    ).setFinalised(true);
    client
      .sendMessage(subscribed)
      .catch((err) => console.log("sendMessage failed with: ", err));
  }
}
