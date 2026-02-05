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
    type: "function" as const,
    function: {
        name: "react_to_message",
        description: "Add a reaction to a single message",
        parameters: {
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
        },
    },
};

const deleteMessage = {
    type: "function" as const,
    function: {
        name: "delete_message",
        description: "Delete a single message",
        parameters: {
            type: "object",
            properties: {
                messageId: {
                    type: "string",
                    description: "The id of the message to delete",
                },
            },
            required: ["messageId"],
        },
    },
};

const changeRole = {
    type: "function" as const,
    function: {
        name: "change_role",
        description: "Change the role of a specific user",
        parameters: {
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
        },
    },
};

const deleteChannel = {
    type: "function" as const,
    function: {
        name: "delete_channel",
        description: "Delete a specific channel by channelId",
        parameters: {
            type: "object",
            properties: {
                channelId: {
                    type: "string",
                    description: "The channelId of the channel to delete",
                },
            },
            required: ["channelId"],
            additionalProperties: false,
        },
    },
};

const createChannel = {
    type: "function" as const,
    function: {
        name: "create_channel",
        description: "Create a channel with default settings",
        parameters: {
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
        },
    },
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

export const allTools: ChatCompletionTool[] = [
    getRecentMessagesTool,
    reactToMessage,
    deleteMessage,
    getTheRules,
    getChatSummary,
    changeRole,
    createChannel,
    deleteChannel,
    getCommunitySummary,
];
