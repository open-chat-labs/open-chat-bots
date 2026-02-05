import { ChatCompletionTool } from "openai/resources";
/**
 * OpenAI tool definitions for the Responses API
 * These tools allow OpenAI to request message history and set up schedules
 */

const getRecentMessagesTool = {
    type: "function" as const,
    function: {
        name: "get_recent_messages",
        description: "Retrieve recent messages from the OpenChat conversations",
        parameters: {
            type: "object",
            properties: {
                count: {
                    type: "number",
                    description: "Number of messages to retrieve (1-500)",
                },
            },
            required: ["count"],
        },
    },
};

const reactToMessage = {
    type: "object",
    properties: {
        messageId: {
            type: "string",
            description: "The id of the message to react to",
        },
        reaction: {
            type: "string",
            description: "The reaction to add to the message",
        },
    },
    required: ["messageId", "reaction"],
};

const deleteMessage = {
    type: "object",
    properties: {
        messageId: {
            type: "string",
            description: "The id of the message to delete",
        },
    },
    required: ["messageId"],
};

const changeRole = {
    type: "object",
    properties: {
        userId: {
            type: "string",
            description: "The userId of the user",
        },
        role: {
            type: "string",
            description: "The new role for the user",
            enum: ["none", "moderator", "owner", "admin", "member"],
        },
    },
    required: ["userId", "role"],
    additionalProperties: false,
};

const deleteChannel = {
    type: "object",
    properties: {
        channelId: {
            type: "string",
            description: "The channelId of the channel to delete",
        },
    },
    required: ["channelId"],
    additionalProperties: false,
};

const createChannel = {
    type: "object",
    properties: {
        name: {
            type: "string",
            description: "The name of the channel",
        },
        description: {
            type: "string",
            description: "The description for the channel",
        },
        isPublic: {
            type: "boolean",
            description: "Whether the channel is public or not",
        },
    },
    required: ["name", "description", "isPublic"],
    additionalProperties: false,
};

const getChatSummary = {
    type: "function" as const,
    function: {
        name: "chat_summary",
        description: "Get all summary information for a single chat",
        parameters: {},
    },
};

const getCommunitySummary = {
    type: "function" as const,
    function: {
        name: "community_summary",
        description: "Get all summary information for the current community",
        parameters: {},
    },
};

const getTheRules = {
    type: "function" as const,
    function: {
        name: "get_rules",
        description: "Get all relevant rules in the current context",
        parameters: {},
    },
};

export const proposePlan = {
    type: "function" as const,
    function: {
        name: "propose_plan",
        description:
            "Propose a sequence of actions to be approved by the user. Each step must match the schema for its action. Nothing is executed until approved.",
        parameters: {
            type: "object",
            properties: {
                reason: {
                    type: "string",
                    description: "Why this plan should be executed",
                },
                steps: {
                    type: "array",
                    maxItems: 5,
                    description:
                        "Ordered list of actions (max 5). Each step must match the corresponding action schema.",
                    items: {
                        oneOf: [
                            {
                                ...createChannel,
                                properties: {
                                    type: { const: "create_channel" },
                                    ...createChannel.properties,
                                },
                                required: ["type", ...(createChannel.required || [])],
                                additionalProperties: false,
                            },
                            {
                                ...deleteChannel,
                                properties: {
                                    type: { const: "delete_channel" },
                                    ...deleteChannel.properties,
                                },
                                required: ["type", ...(deleteChannel.required || [])],
                                additionalProperties: false,
                            },
                            {
                                ...changeRole,
                                properties: {
                                    type: { const: "change_role" },
                                    ...changeRole.properties,
                                },
                                required: ["type", ...(changeRole.required || [])],
                                additionalProperties: false,
                            },
                            {
                                ...deleteMessage,
                                properties: {
                                    type: { const: "delete_message" },
                                    ...deleteMessage.properties,
                                },
                                required: ["type", ...(deleteMessage.required || [])],
                                additionalProperties: false,
                            },
                            {
                                ...reactToMessage,
                                properties: {
                                    type: { const: "react_to_message" },
                                    ...reactToMessage.properties,
                                },
                                required: ["type", ...(reactToMessage.required || [])],
                                additionalProperties: false,
                            },
                        ],
                    },
                },
            },
            required: ["reason", "steps"],
            additionalProperties: false,
        },
    },
};

export const allTools: ChatCompletionTool[] = [
    getRecentMessagesTool,
    getTheRules,
    getChatSummary,
    getCommunitySummary,
    proposePlan,
];
