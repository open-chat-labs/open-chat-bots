/**
 * Create a simple express js server. This should have two endpoints:
 * /execute_command - to receive commands as POST requests from the OpenChat front end
 * / - to receive any GET request from the OpenChat front end (or elsewhere) and return the bot's schema definition
 */
import express from "express";
import cors from "cors";
import executeCommand from "./handlers/executeCommand";
import schema from "./handlers/schema";
import {
  createApiChatClient,
  createCommandChatClient,
} from "./middleware/botclient";
import { rateLimit } from "express-rate-limit";
import { BotClientFactory } from "@open-ic/openchat-botclient-ts";
import executeAction from "./handlers/executeAction";
import createChannel from "./handlers/createChannel";

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 3, // 3 per minute
  standardHeaders: "draft-8",
  legacyHeaders: false,
  statusCode: 429,
});

const app = express();

/**
 * Here, some of the various arguments needed to create an instance of the BotClient are retrieved from environment variables.
 * See the readme for more information.
 */
const factory = new BotClientFactory({
  openchatPublicKey: process.env.OC_PUBLIC!,
  icHost: process.env.IC_HOST!,
  identityPrivateKey: process.env.IDENTITY_PRIVATE!,
  openStorageCanisterId: process.env.STORAGE_INDEX_CANISTER!,
});

app.use(cors());
app.use(limiter);
app.use(express.text());
app.post(
  "/execute_command",
  createCommandChatClient(factory), // insert the middleware that will create the OpenChat BotClient
  executeCommand
);
app.post(
  "/execute_action",
  createApiChatClient(factory), // insert the middleware that will create the OpenChat BotClient
  executeAction
);
app.post(
  "/create_channel",
  createApiChatClient(factory), // insert the middleware that will create the OpenChat BotClient
  createChannel
);
app.get("/", schema);

export default app;
