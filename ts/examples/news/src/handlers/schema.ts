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
      "This bot demonstrates scraping the BBC News website for news headlines",
    commands: [
      {
        name: "news",
        default_role: "Participant",
        description: "Show a list of the current news headlines",
        placeholder: "Searching for the headlines ...",
        permissions: Permissions.encodePermissions({
          ...emptyPermissions,
          message: ["Text"],
        }),
        params: [],
      },
    ],
  };
}

export default function schema(_: Request, res: Response) {
  res.status(200).json(getBotDefinition());
}
