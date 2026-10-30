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
      "Retrieval-augmented FAQ bot. Answers user questions by searching a local FAQ corpus and consulting an LLM.",
    commands: [
      {
        name: "ask",
        default_role: "Participant",
        description: "Ask a question about the FAQ corpus",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
        }),
        direct_messages: true,
        params: [
          {
            name: "question",
            required: true,
            description: "The question to ask",
            placeholder: "What do you want to know?",
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
