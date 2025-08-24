/**
 * Create a simple express js server. This should have two endpoints:
 * /execute_command - to receive commands as POST requests from the OpenChat front end
 * / - to receive any GET request from the OpenChat front end (or elsewhere) and return the bot's schema definition
 */
import { BotClientFactory } from "@open-ic/openchat-botclient-ts";
import cors from "cors";
import express from "express";
import executeCommand from "./handlers/executeCommand";
import handleNotification from "./handlers/notify";
import schema from "./handlers/schema";
import { createCommandChatClient } from "./middleware/botclient";

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
app.post("/notify", express.text(), handleNotification);
app.post("/execute_command", express.text(), createCommandChatClient(factory), executeCommand);
app.get("/bot_definition", schema);
app.get("/", schema);

export default app;
