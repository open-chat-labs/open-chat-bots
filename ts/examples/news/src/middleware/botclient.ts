/**
 * This is an express middleware to create an instance of the OpenChat BotClient
 * which can be used for the duration of a single request to interact with the OpenChat backend.
 * See the readme for more explanation.
 */
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
      console.log("Bot client created");
      next();
    } catch (err: any) {
      console.log("Error creating bot client: ", err);
      if (err instanceof BadRequestError) {
        res.status(400).send(err.message);
      } else {
        res.status(500).send(err.message);
      }
    }
  };
}
