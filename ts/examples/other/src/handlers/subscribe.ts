import { Response } from "express";
import { WithBotClient } from "../types";
import { ping } from "./ping";
import { success } from "./success";

export default async function (req: WithBotClient, res: Response) {
  const client = req.botClient;
  const scope = client.scope;
  if (!scope.isChatScope()) {
    const notSubscribed = (
      await client.createTextMessage(
        "You can only run the subscribe command in a chat context"
      )
    )
      .setFinalised(true)
      .makeEphemeral();
    res.status(200).json(success(notSubscribed));
  } else {
    if (!ping.subscribe(scope)) {
      const notSubscribed = (
        await client.createTextMessage(
          "The bot does not appear to be installed in this location. This should not happen"
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
}
