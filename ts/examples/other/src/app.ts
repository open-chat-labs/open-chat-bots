/**
 * Create a simple express js server. This should have two endpoints:
 * /execute_command - to receive commands as POST requests from the OpenChat front end
 * / - to receive any GET request from the OpenChat front end (or elsewhere) and return the bot's schema definition
 */
import cors from "cors";
import express from "express";
import { factory } from "./factory";
import executeCommand from "./handlers/executeCommand";
import { notify } from "./handlers/notify";
import schema from "./handlers/schema";
import { createCommandChatClient } from "./middleware/botclient";

const app = express();

app.use(cors());
app.post("/notify", express.raw({ type: "application/msgpack" }), notify);
app.post("/execute_command", express.text(), createCommandChatClient(factory), executeCommand);
app.get("/bot_definition", schema);
app.get("/", schema);

export default app;
