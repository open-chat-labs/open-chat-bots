/**
 * Create a simple express js server. This should have two endpoints:
 * /execute_command - to receive commands as POST requests from the OpenChat front end
 * / - to receive any GET request from the OpenChat front end (or elsewhere) and return the bot's schema definition
 */
import { BotClientFactory } from "@open-ic/openchat-botclient-ts";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import createChannel from "./handlers/createChannel";
import deleteChannel from "./handlers/deleteChannel";
import executeAction from "./handlers/executeAction";
import executeCommand from "./handlers/executeCommand";
import handleNotification from "./handlers/notify";
import schema from "./handlers/schema";
import {
  createApiChatClient,
  createCommandChatClient,
} from "./middleware/botclient";

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
app.post("/notify", express.json(), handleNotification);
app.post(
  "/execute_command",
  express.text(),
  createCommandChatClient(factory),
  executeCommand
);
app.post(
  "/execute_action",
  express.text(),
  createApiChatClient(factory),
  executeAction
);
app.post(
  "/create_channel",
  express.text(),
  createApiChatClient(factory),
  createChannel
);
app.post(
  "/delete_channel",
  express.text(),
  createApiChatClient(factory),
  deleteChannel
);
app.get("/bot_definition", schema);
app.get("/", schema);

export default app;
