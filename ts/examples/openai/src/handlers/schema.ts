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
      "This bot demonstrates integration with OpenAI to create a chat bot",
    autonomous_config: {
      permissions: Permissions.encodePermissions({
        ...emptyPermissions,
        message: ["Text"],
        chat: [
          "ReactToMessages",
          "ReadMessages",
          "ReadChatSummary",
          "DeleteMessages",
        ],
      }),
    },
    default_subscriptions: {
      community: [],
      chat: ["Message"],
    },
    commands: [
      {
        name: "prompt",
        default_role: "Participant",
        description: "Send a prompt to ChatGPT",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
          chat: ["ReadChatSummary"],
        }),
        direct_messages: true,
        params: [
          {
            name: "prompt",
            required: true,
            description: "The prompt to send into the LLM",
            placeholder: "How can I help you?",
            param_type: {
              StringParam: {
                min_length: 1,
                max_length: 1000,
                choices: [],
                multi_line: true,
              },
            },
          },
        ],
      },
      {
        name: "imagine",
        default_role: "Participant",
        description: "Generate an image with AI",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
          chat: ["ReadMessages"],
        }),
        params: [
          {
            name: "prompt",
            required: true,
            description: "The prompt to send into the LLM",
            placeholder: "What do you want me to draw?",
            param_type: {
              StringParam: {
                min_length: 1,
                max_length: 1000,
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
