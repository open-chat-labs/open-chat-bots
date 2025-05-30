import { BotClientFactory } from "@open-ic/openchat-botclient-ts";
import cors from "cors";
import express from "express";
import executeCommand from "./handlers/executeCommand";
import schema from "./handlers/schema";
import { createCommandChatClient } from "./middleware/botclient";

const app = express();

const factory = new BotClientFactory({
  openchatPublicKey: process.env.OC_PUBLIC!,
  icHost: process.env.IC_HOST!,
  identityPrivateKey: process.env.IDENTITY_PRIVATE!,
  openStorageCanisterId: process.env.STORAGE_INDEX_CANISTER!,
});

app.use(cors());
app.post(
  "/execute_command",
  express.text(),
  createCommandChatClient(factory),
  executeCommand
);
app.get("/bot_definition", schema);
app.get("/", schema);

export default app;
