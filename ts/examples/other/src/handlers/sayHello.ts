import { argumentsInvalid } from "@open-ic/openchat-botclient-ts";
import { Response } from "express";
import { WithBotClient } from "../types";
import { success } from "./success";

export default async function (req: WithBotClient, res: Response) {
  const client = req.botClient;
  const user = client.userArg("user");

  if (user !== undefined) {
    const msg = await client.createTextMessage(`Hello @UserId(${user})`);
    msg.setFinalised(true);

    client
      .sendMessage(msg)
      .catch((err: unknown) =>
        console.error("sendTextMessage failed with: ", err)
      );

    res.status(200).json(success(msg));
  } else {
    res.status(400).send(argumentsInvalid());
  }
}
