import {
  InstallationRecord,
  parseBotNotification,
} from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";
import { ping } from "./ping";

export default async function handleNotification(req: Request, res: Response) {
  const result = parseBotNotification(req.body);
  if (result.kind === "bot_event_wrapper") {
    if (result.event.kind === "bot_installed_event") {
      ping.install(
        result.event.location,
        new InstallationRecord(
          result.apiGateway,
          result.event.grantedAutonomousPermissions,
          result.event.grantedCommandPermissions
        )
      );
    }
  }
  res.status(200).json({});
}
