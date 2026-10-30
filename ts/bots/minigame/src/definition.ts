// The bot's definition, which OpenChat fetches from `/bot_definition` when the bot is registered,
// and shows when it's installed. One command posts a game's card; which game is a parameter, so
// adding a game adds a choice rather than a command.
import { Permissions } from "@open-ic/openchat-botclient-ts";
import { GAMES } from "./games/registry";

export const definition = {
    description:
        "Play games with the people in your chat. `/play` posts a game card: join from the card, " +
        "and the game opens in OpenChat. The first game is a 2048 race for up to 9 players, where " +
        "the first to make a 2048 tile wins.",
    commands: [
        {
            name: "play",
            description: "Post a game for people in this chat to join",
            placeholder: "Setting up the game ...",
            params: [
                {
                    name: "game",
                    description: "Which game to play",
                    placeholder: "Choose a game",
                    required: true,
                    param_type: {
                        StringParam: {
                            min_length: 1,
                            max_length: 20,
                            choices: GAMES.map((game) => ({ name: game.title, value: game.id })),
                            multi_line: false,
                        },
                    },
                },
            ],
            // As bitflags, which is how OpenChat reads a definition's permissions
            permissions: Permissions.encodePermissions({
                community: [],
                chat: [],
                message: ["MiniApp"],
            }),
            default_role: "Participant",
        },
    ],
    // A card can't be posted in a direct chat
    restricted_locations: ["Community", "Group"],
};
