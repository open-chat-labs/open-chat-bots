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
    additionalProperties: false,
};

const reactToMessages = {
    type: "object",
    properties: {
        messageIds: {
            type: "array",
            items: { type: "string" },
            description: "The IDs of the messages to react to",
            minItems: 1,
        },
        reaction: {
            type: "string",
            description: "The reaction to add to the messages",
        },
    },
    required: ["messageIds", "reaction"],
    additionalProperties: false,
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
    additionalProperties: false,
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
        description: `
        Propose a sequence of actions for user approval.
        STRICT RULES:
        - Each step MUST be one of the allowed action types listed below.
        - The "action" field MUST be exactly one of:
          - "create_channel"
          - "delete_channel"
          - "change_role"
          - "delete_message"
          - "react_to_message"
          - "react_to_messages"
        - No other "action" values are allowed.
        - Do NOT invent new step actions.
        - If no valid step action applies, do NOT return propose_plan.
        - Each step MUST exactly match its schema.
        - Do NOT omit required fields.
        - Do NOT include extra fields.
        Nothing is executed until approved.
        `,
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
                                    action: { const: "create_channel" },
                                    ...createChannel.properties,
                                },
                                required: ["action", ...(createChannel.required || [])],
                                additionalProperties: false,
                            },
                            {
                                ...deleteChannel,
                                properties: {
                                    action: { const: "delete_channel" },
                                    ...deleteChannel.properties,
                                },
                                required: ["action", ...(deleteChannel.required || [])],
                                additionalProperties: false,
                            },
                            {
                                ...changeRole,
                                properties: {
                                    action: { const: "change_role" },
                                    ...changeRole.properties,
                                },
                                required: ["action", ...(changeRole.required || [])],
                                additionalProperties: false,
                            },
                            {
                                ...deleteMessage,
                                properties: {
                                    action: { const: "delete_message" },
                                    ...deleteMessage.properties,
                                },
                                required: ["action", ...(deleteMessage.required || [])],
                                additionalProperties: false,
                            },
                            {
                                ...reactToMessage,
                                properties: {
                                    action: { const: "react_to_message" },
                                    ...reactToMessage.properties,
                                },
                                required: ["action", ...(reactToMessage.required || [])],
                                additionalProperties: false,
                            },
                            {
                                ...reactToMessages,
                                properties: {
                                    action: { const: "react_to_messages" },
                                    ...reactToMessages.properties,
                                },
                                required: ["action", ...(reactToMessages.required || [])],
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
