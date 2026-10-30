// The bot's definition, which OpenChat fetches from `/bot_definition` when the bot is registered,
// and shows when it's installed. One command posts a game's card; which game is a parameter, so
// adding a game adds a choice rather than a command. The definition also lists the apps the bot
// hosts, one per game, with their images: OpenChat refuses a card whose app isn't listed.
import { Permissions } from "@open-ic/openchat-botclient-ts";
import { GAMES } from "./games/registry";

export const definition = {
    description:
        "Play games with the people in your chat. `/play` posts a game card: join from the card, " +
        "and the game opens in OpenChat. Race to 2048 with up to 10 players, where the first to " +
        "make the target tile wins, or the top score when the time's up (2048 and 10 minutes " +
        "unless set, with the command or by the host in the lobby), or play chess, two players " +
        "with 10 minutes each, which anyone in the chat can watch.",
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
                // Each game's settings, which its host can also change in the lobby
                ...GAMES.flatMap((game) =>
                    game.settings.map((setting) => ({
                        name: setting.id,
                        description: setting.description,
                        placeholder: setting.label,
                        required: false,
                        param_type: {
                            IntegerParam: {
                                min_value: Math.min(...setting.choices.map((c) => c.value)),
                                max_value: Math.max(...setting.choices.map((c) => c.value)),
                                choices: setting.choices.map((c) => ({
                                    name: c.label,
                                    value: c.value,
                                })),
                            },
                        },
                    })),
                ),
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
    // Each game's app, which its card names, with the image shown when there's no app to show
    mini_apps: GAMES.map((game) => ({ name: game.id, image_url: game.image })),
};
