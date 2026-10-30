// `/play <game>`: posts the game's card in the chat, through the MiniApp service, and records the
// game, so that the service's join, start and leave calls for it have somewhere to go.
import {
    BadRequestError,
    MiniAppServiceError,
    argumentsInvalid,
    miniAppGameFromPostToken,
    type BotClient,
    type Message,
    type MiniAppMessage,
    type MiniAppServiceClient,
} from "@open-ic/openchat-botclient-ts";
import type { Request, Response } from "express";
import type { Deps } from "../deps";
import { Race2048 } from "../games/race2048/race";
import { gameType } from "../games/registry";

const POST_ATTEMPTS = 3;
const POST_RETRY_MS = 1000;

export async function executeCommand(req: Request, res: Response, deps: Deps): Promise<void> {
    // OpenChat sends the command's token in a header; older versions sent it as the body
    const header = req.headers["x-oc-jwt"];
    const jwt = typeof header === "string" ? header : typeof req.body === "string" ? req.body : "";
    let client: BotClient;
    try {
        client = deps.factory.createClientFromCommandJwt(jwt);
    } catch (err) {
        if (err instanceof BadRequestError) {
            res.status(400).send(err.message);
        } else {
            console.error("Couldn't read the command:", err);
            res.status(500).send("Couldn't read the command");
        }
        return;
    }
    if (client.commandName !== "play") {
        res.status(400).send("CommandNotFound");
        return;
    }
    try {
        await play(client, res, deps);
    } catch (err) {
        console.error("/play failed:", err);
        if (!res.headersSent) {
            res.status(500).send("The game couldn't be set up");
        }
    }
}

async function play(client: BotClient, res: Response, deps: Deps): Promise<void> {
    const game = gameType(client.stringArg("game"));
    if (game === undefined) {
        res.status(400).send(argumentsInvalid());
        return;
    }
    if (client.chatScope === undefined) {
        res.json(await ephemeral(client, "Games are played in a group or a channel."));
        return;
    }
    const miniApps = deps.useApiGateway(client.apiGateway);

    const card = (await client.createMiniAppMessage(game.cardText, game.appSize))
        .setMaxPlayers(game.maxPlayers)
        .setSpectators(game.spectators);
    const invalid = card.validate();
    if (invalid !== undefined) {
        throw new Error(`The card is invalid: ${invalid}`);
    }

    const token = await client.miniAppPostToken();
    // Known before it's posted: the service may forward a join before the bot hears its answer
    const miniAppGame = miniAppGameFromPostToken(token);
    deps.store.create(miniAppGame, Race2048.create({ target: deps.raceTarget }));
    try {
        await post(miniApps, token, card);
    } catch (err) {
        deps.store.delete(miniAppGame);
        const reason =
            err instanceof MiniAppServiceError
                ? err.kind === "unavailable"
                    ? "the MiniApp service isn't available right now"
                    : err.message
                : "something went wrong";
        console.error("Couldn't post the card:", err);
        res.json(await ephemeral(client, `The game couldn't be set up: ${reason}.`));
        return;
    }
    console.log(`Posted a ${game.id} game in ${client.chatScope.toString()}`);
    // The card is the command's message, so the command has nothing more to say
    res.json({});
}

/** Posts the card, trying again with the same token while the service can't reach OpenChat */
async function post(miniApps: MiniAppServiceClient, token: string, card: MiniAppMessage) {
    for (let attempt = 1; ; attempt++) {
        try {
            await miniApps.post(token, card);
            return;
        } catch (err) {
            const again =
                err instanceof MiniAppServiceError &&
                err.kind === "unavailable" &&
                attempt < POST_ATTEMPTS;
            if (!again) throw err;
            await new Promise((resolve) => setTimeout(resolve, POST_RETRY_MS));
        }
    }
}

/** A message only the command's user sees, which isn't sent to OpenChat */
async function ephemeral(client: BotClient, text: string): Promise<{ message: unknown }> {
    const message: Message = (await client.createTextMessage(text))
        .makeEphemeral()
        .setFinalised(true);
    return { message: message.toResponse() };
}
