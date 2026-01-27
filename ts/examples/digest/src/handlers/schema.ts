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
      "A bot that summarizes recent chat activity using AI. Use /summarise for one-time summaries or /schedule for automatic recurring digests.",
    autonomous_config: {
      permissions: Permissions.encodePermissions({
        ...emptyPermissions,
        message: ["Text"],
        chat: ["ReadMessages", "ReadChatSummary"],
      }),
    },
    default_subscriptions: {
      community: [],
      chat: [], // No default subscriptions - we trigger via scheduler
    },
    commands: [
      {
        name: "summarise",
        default_role: "Participant",
        description: "Generate a one-time summary of recent chat messages",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
          chat: ["ReadMessages", "ReadChatSummary"],
        }),
        direct_messages: true,
        params: [
          {
            name: "prompt",
            required: true,
            description:
              "Describe what you want to summarize (e.g., 'last 200 messages', 'recent activity', 'yesterday's discussion')",
            placeholder: "last 200 messages",
            param_type: {
              StringParam: {
                min_length: 1,
                max_length: 500,
                choices: [],
                multi_line: true,
              },
            },
          },
        ],
      },
      {
        name: "schedule",
        default_role: "Participant",
        description: "Schedule automatic recurring summaries",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
          chat: ["ReadMessages", "ReadChatSummary"],
        }),
        direct_messages: false, // Scheduling doesn't make sense in DMs
        params: [
          {
            name: "prompt",
            required: true,
            description:
              "Describe your schedule (e.g., 'last 200 messages every morning', 'summarize 100 messages every Monday at 2pm', 'digest last 50 messages every 6 hours')",
            placeholder: "last 200 messages every morning",
            param_type: {
              StringParam: {
                min_length: 1,
                max_length: 500,
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
