import {
    accessTokenNotFound,
    BadRequestError,
    BotClientFactory,
} from "@open-ic/openchat-botclient-ts";
import { NextFunction, Request, Response } from "express";
import { WithBotClient } from "../types";

export function createCommandChatClient(factory: BotClientFactory) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const token = req.headers["x-oc-jwt"];
      if (!token) {
        throw new BadRequestError(accessTokenNotFound());
      }

      (req as WithBotClient).botClient = factory.createClientFromCommandJwt(
        token as string
      );
      next();
    } catch (err: any) {
      res.status(400).send(err.message);
    }
  };
}
