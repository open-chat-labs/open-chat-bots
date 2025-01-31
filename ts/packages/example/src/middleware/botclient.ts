/**
 * This is an express middleware to create an instance of the OpenChat BotClient
 * which can be used for the duration of a single request to interact with the OpenChat backend.
 * See the readme for more explanation.
 */
import { Request, Response, NextFunction } from "express";
import {
  BadRequestError,
  BotClientFactory,
} from "@open-ic/openchat-botclient-ts";
import { WithApiKeyChatClient, WithCommandChatClient } from "../types";

export function createCommandChatClient(factory: BotClientFactory) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      (req as WithCommandChatClient).botClient =
        factory.createCommandChatClient(req.body);
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

export function createApiChatClient(factory: BotClientFactory) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = req.headers["x-api-key"];
      if (typeof apiKey !== "string") {
        res.status(400).send("Request header x-api-key not found");
      } else {
        (req as WithApiKeyChatClient).botClient =
          await factory.createApiKeyChatClient(apiKey);
        console.log("Bot client created");
        next();
      }
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
