import { parseBotNotification } from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";

export default async function handleNotification(req: Request, res: Response) {
  console.log("headers:", req.headers);
  console.log("Notify: ", req.body);
  const result = parseBotNotification(req.body);
  res.status(200).json({});
}
