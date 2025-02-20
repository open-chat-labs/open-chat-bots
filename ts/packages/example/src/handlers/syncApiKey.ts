import { Response } from "express";
import { WithBotClient } from "../types";
import { success } from "./success";
import { ping } from "./ping";

export default async function (req: WithBotClient, res: Response) {
  const client = req.botClient;
  const apiKey = client.stringArg("api_key");
  if (apiKey !== undefined) {
    console.log("Bot received api key: ", apiKey);
    ping.setApiKey(apiKey);
  }
  res.status(200).json(success());
}
