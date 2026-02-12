import { BotDefinition, Permissions } from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";

const emptyPermissions = {
    chat: [],
    community: [],
    message: [],
};

function getBotDefinition(): BotDefinition {
    return {
        description:
            "A bot that can perform any function or sequence of functions that the bot sdk itself can perform. Just describe naturally what you would like to do - but be careful because this bot can do anything.",
        autonomous_config: {
            permissions: Permissions.encodePermissions({
                message: ["Text"],
                community: ["CreatePublicChannel", "CreatePrivateChannel", "ReadCommunitySummary"],
                chat: [
                    "AddMembers",
                    "ChangeRoles",
                    "DeleteMessages",
                    "ReactToMessages",
                    "ReadChatSummary",
                    "ReadMessages",
                ],
            }),
        },
        default_subscriptions: {
            community: [],
            chat: ["MessageReaction", "Message"],
        },
        commands: [
            {
                name: "prompt",
                default_role: "Participant",
                description: "Describe what you would like the bot to do for you",
                permissions: Permissions.encodePermissions({
                    ...emptyPermissions,
                    message: ["Text"],
                    chat: [
                        "AddMembers",
                        "ChangeRoles",
                        "DeleteMessages",
                        "ReactToMessages",
                        "ReadChatSummary",
                        "ReadMessages",
                    ],
                    community: [
                        "CreatePrivateChannel",
                        "CreatePublicChannel",
                        "ReadCommunitySummary",
                    ],
                }),
                direct_messages: true,
                params: [
                    {
                        name: "prompt",
                        required: true,
                        description:
                            "Just describe naturally what you would like the bot to do for you",
                        placeholder: "Enter instructions",
                        param_type: {
                            StringParam: {
                                min_length: 1,
                                max_length: 2000,
                                choices: [],
                                multi_line: true,
                            },
                        },
                    },
                ],
            },
        ],
    };
}

export default function schema(_: Request, res: Response) {
    res.status(200).json(getBotDefinition());
}
