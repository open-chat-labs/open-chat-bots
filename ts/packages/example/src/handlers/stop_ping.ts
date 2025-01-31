import { Response } from "express";
import { ping } from "./ping";
import { success } from "./success";
import { WithCommandChatClient } from "../types";

export default async function (req: WithCommandChatClient, res: Response) {
  const client = req.botClient;
  const msg = await client.createTextMessage(true, "Stop pinging ...");

  client
    .sendMessage(msg)
    .catch((err: unknown) =>
      console.error("sendTextMessage failed with: ", err)
    );

  res.status(200).json(success(msg));

  ping.stop();
}
