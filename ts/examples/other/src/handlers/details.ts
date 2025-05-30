import { ChatDetailsSuccess } from "@open-ic/openchat-botclient-ts";
import { Response } from "express";
import { WithBotClient } from "../types";
import { success } from "./success";

export default async function (req: WithBotClient, res: Response) {
  const client = req.botClient;
  if (client.chatScope !== undefined) {
    const resp = await client.chatDetails();
    if (resp.kind === "success") {
      const msg = createSuccessMessage(resp);
      const details = (await client.createTextMessage(msg)).setFinalised(true);
      client
        .sendMessage(details)
        .catch((err) => console.error("sendMessage failed with: ", err));
      res.status(200).json(success(details));
    } else {
      const error = (
        await client.createTextMessage(
          "Hmmm sorry we couldn't load the chat details"
        )
      )
        .setFinalised(true)
        .makeEphemeral();
      res.status(200).json(success(error));
    }
  } else {
    res
      .status(200)
      .json(
        success(
          (
            await client.createTextMessage(
              "You can only call this command in the context of a chat"
            )
          ).makeEphemeral()
        )
      );
  }
}

function createSuccessMessage(details: ChatDetailsSuccess): string {
  return `
        Name: ${details.name}

        Description: ${details.description}

        Is public: ${details.isPublic}

        History visible: ${details.historyVisibleToNewJoiners}

        Messages visible to non-members: ${details.messagesVisibleToNonMembers}

        Number of members: ${details.memberCount}
    `;
}
