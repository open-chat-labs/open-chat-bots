// The bot's definition, which OpenChat fetches from `/bot_definition` when the bot is registered,
// and shows when it's installed. One command posts a game's card; which game is a parameter, so
// adding a game adds a choice rather than a command. The definition also lists the apps the bot
// hosts, one per game, with their images: OpenChat refuses a card whose app isn't listed.
import { Permissions } from "@open-ic/openchat-botclient-ts";
import { GAMES } from "./games/registry";

/** The bot's apps, as the games declare them */
type SettingParam = {
    name: string;
    description: string;
    placeholder: string;
    required: false;
    param_type: {
        IntegerParam: {
            min_value: number;
            max_value: number;
            choices: { name: string; value: number }[];
        };
    };
};

/**
 * A parameter per setting. Games with a setting of the same id, eg. a time limit in minutes,
 * share one parameter, offering every game's choices: the game chosen takes the value if it's one
 * of its own choices, and refuses it otherwise, so a value picked for the other game is refused
 * with the choices that would do.
 */
function settingParams(): SettingParam[] {
    const params = new Map<string, SettingParam>();
    for (const game of GAMES) {
        for (const setting of game.settings) {
            const choices = setting.choices.map((c) => ({ name: c.label, value: c.value }));
            const param = params.get(setting.id);
            if (param === undefined) {
                params.set(setting.id, {
                    name: setting.id,
                    description: `${game.title}: ${setting.description}`,
                    placeholder: setting.label,
                    required: false,
                    param_type: {
                        IntegerParam: {
                            min_value: Math.min(...choices.map((c) => c.value)),
                            max_value: Math.max(...choices.map((c) => c.value)),
                            choices,
                        },
                    },
                });
                continue;
            }
            const integer = param.param_type.IntegerParam;
            param.description += `; ${game.title}: ${setting.description}`;
            for (const choice of choices) {
                if (!integer.choices.some((c) => c.value === choice.value)) {
                    integer.choices.push(choice);
                }
            }
            integer.choices.sort((a, b) => a.value - b.value);
            integer.min_value = Math.min(integer.min_value, ...choices.map((c) => c.value));
            integer.max_value = Math.max(integer.max_value, ...choices.map((c) => c.value));
        }
    }
    return [...params.values()];
}

export const definition = {
    description:
        "Play games with the people in your chat. `/play` posts a game card: join from the card, " +
        "and the game opens in OpenChat. Race to 2048 with up to 100 players, where the first to " +
        "make the target tile wins, or the top score when the time's up (2048 and 10 minutes " +
        "unless set, with the command or by the host in the lobby), or play chess, two players " +
        "which anyone in the chat can watch, with the time, the increment and who's White set " +
        "the same way.",
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
                ...settingParams(),
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
