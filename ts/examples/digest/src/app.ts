import cors from "cors";
import express from "express";
import { factory } from "./factory";
import executeCommand from "./handlers/executeCommand";
import { notify } from "./handlers/notify";
import schema from "./handlers/schema";
import { createCommandChatClient } from "./middleware/botclient";
import { DigestScheduler } from "./services/scheduler";
import { InMemoryScheduleStore } from "./services/scheduleStore";

const app = express();

const scheduleStore = new InMemoryScheduleStore();
const scheduler = new DigestScheduler(factory, scheduleStore);
scheduler.start();

app.use(cors());
app.post(
    "/execute_command",
    express.text(),
    createCommandChatClient(factory),
    executeCommand(scheduler),
);
app.post("/notify", express.raw({ type: "application/msgpack" }), (req, res) =>
    notify(req, res, scheduler),
);
app.get("/bot_definition", schema);
app.get("/", schema);

export default app;
