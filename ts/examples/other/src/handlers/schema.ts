import { BotDefinition, Permissions } from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";

const emptyPermissions = {
  chat: [],
  community: [],
  message: [],
};

function getBotDefinition(): BotDefinition {
  return {
    autonomous_config: {
      permissions: Permissions.encodePermissions({
        message: ["Text", "Image", "P2pSwap", "VideoCall"],
        community: [
          "RemoveMembers",
          "ChangeRoles",
          "CreatePublicChannel",
          "CreatePrivateChannel",
        ],
        chat: ["ReadMessages"],
      }),
    },
    description:
      "This is a demonstration bot which demonstrates a variety of different approaches and techniques that bot developers can use.",
    commands: [
      {
        name: "subscribe",
        default_role: "Owner",
        description: "Start pinging this context",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
        }),
        params: [],
      },
      {
        name: "unsubscribe",
        default_role: "Owner",
        description: "Stop pinging this context",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
        }),
        params: [],
      },
      {
        name: "numbers",
        default_role: "Participant",
        description: "Handle different types of numbers",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
        }),
        params: [
          {
            name: "int_one",
            required: true,
            description: "First integer argument",
            placeholder: "Enter an integer",
            param_type: {
              IntegerParam: {
                min_value: BigInt(-100),
                max_value: BigInt(100),
                choices: [],
              },
            },
          },
          {
            name: "dec_one",
            required: true,
            description: "First decimal argument",
            placeholder: "Enter a decimal",
            param_type: {
              DecimalParam: {
                min_value: -100,
                max_value: 100,
                choices: [],
              },
            },
          },
        ],
      },
      {
        name: "poll",
        default_role: "Participant",
        description: "Send a random poll",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Poll"],
        }),
        params: [],
      },
      {
        name: "image",
        default_role: "Participant",
        description: "Post an image message",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Image"],
        }),
        params: [],
      },
      {
        name: "file",
        default_role: "Participant",
        description: "Post a file message",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["File"],
        }),
        params: [],
      },
      {
        name: "chat_summary",
        default_role: "Participant",
        description: "Return the summary of the current chat",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
          chat: ["ReadChatDetails"],
        }),
        params: [],
      },
      {
        name: "chat_events",
        default_role: "Participant",
        description: "Return the most recent messages for this chat",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
          chat: ["ReadChatDetails", "ReadMessages"],
        }),
        params: [],
      },
      {
        name: "say_hello",
        description: "Say hello to a user",
        default_role: "Participant",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
        }),
        params: [
          {
            name: "user",
            required: true,
            description: "The user to say hello to",
            placeholder: "Please select a user",
            param_type: "UserParam",
          },
        ],
      },
    ],
  };
}

export default function schema(_: Request, res: Response) {
  res.status(200).json(getBotDefinition());
}
