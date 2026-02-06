import cors from "cors";
import express from "express";
import { factory } from "./factory";
import executeCommand from "./handlers/executeCommand";
import { notify } from "./handlers/notify";
import schema from "./handlers/schema";
import { createCommandChatClient } from "./middleware/botclient";

const app = express();

app.use(cors());
app.post("/execute_command", express.text(), createCommandChatClient(factory), executeCommand());
app.post("/notify", express.raw({ type: "application/msgpack" }), notify);
app.get("/bot_definition", schema);
app.get("/", schema);

export default app;
