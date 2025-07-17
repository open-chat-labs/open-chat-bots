import {
  ChatEventsSuccess,
  CommunityEventsSuccess,
} from "@open-ic/openchat-botclient-ts";
import { Response } from "express";
import { WithBotClient } from "../types";
import { ephemeralMsg } from "./helpers";
import { success } from "./success";

export async function communityEvents(req: WithBotClient, res: Response) {
  const client = req.botClient;
  const scope = client.chatScope;
  if (scope === undefined) {
    res
      .status(200)
      .json(
        success(
          await ephemeralMsg(client, "Commandcan only be run in a chat scope")
        )
      );
    return;
  }
  if (!scope.chat.isChannel()) {
    res
      .status(200)
      .json(
        success(
          await ephemeralMsg(
            client,
            "This command only makes sense in a community channel"
          )
        )
      );
    return;
  }

  const communityId = client.communityId;
  if (!communityId) {
    res
      .status(200)
      .json(
        success(
          await ephemeralMsg(client, "Couldn't determine the community Id")
        )
      );
    return;
  }

  const resp = await client.communitySummary(communityId);
  if (resp.kind === "error") {
    res
      .status(200)
      .json(
        success(
          await ephemeralMsg(client, "Unable to to load the community summary")
        )
      );
    return;
  }

  const eventsResp = await client.communityEvents({
    kind: "community_events_page",
    maxEvents: 50,
    startEventIndex: resp.latestEventIndex,
    ascending: false,
  });
  if (eventsResp.kind !== "success") {
    res
      .status(200)
      .json(
        success(
          await ephemeralMsg(
            client,
            "Unable to load the events for the community"
          )
        )
      );
    return;
  }
  const msg = createCommunityEventsMessage(eventsResp);
  const details = (await client.createTextMessage(msg)).setFinalised(true);
  client
    .sendMessage(details)
    .catch((err) => console.error("sendMessage failed with: ", err));
  res.status(200).json(success(details));
}

export async function chatEvents(req: WithBotClient, res: Response) {
  const client = req.botClient;
  if (client.chatScope === undefined) {
    res
      .status(200)
      .json(
        success(
          await ephemeralMsg(client, "Commandcan only be run in a chat scope")
        )
      );
    return;
  }
  const resp = await client.chatSummary();
  if (resp.kind === "error") {
    res
      .status(200)
      .json(
        success(
          await ephemeralMsg(client, "Unable to to load the chat details")
        )
      );
    return;
  }

  const eventsResp = await client.chatEvents({
    kind: "chat_events_page",
    maxEvents: 50,
    maxMessages: 50,
    startEventIndex: resp.latestEventIndex,
    ascending: false,
  });
  if (eventsResp.kind !== "success") {
    res
      .status(200)
      .json(
        success(
          await ephemeralMsg(client, "Unable to load the events for the chat")
        )
      );
    return;
  }
  const msg = createChatEventsMessage(eventsResp);
  const details = (await client.createTextMessage(msg)).setFinalised(true);
  client
    .sendMessage(details)
    .catch((err) => console.error("sendMessage failed with: ", err));
  res.status(200).json(success(details));
}

// writes out the message text for all of the text content messages
function createChatEventsMessage(resp: ChatEventsSuccess): string {
  const msgs: string[] = [];
  resp.events.forEach((ev) => {
    if (
      ev.event.kind === "message" &&
      ev.event.content.kind === "text_content"
    ) {
      msgs.push(ev.event.content.text);
      msgs.push(`Sent by: @UserId(${ev.event.sender})`);
      msgs.push("=================================\n\n");
    }
  });
  return msgs.join("\n");
}

function createCommunityEventsMessage(resp: CommunityEventsSuccess): string {
  const msgs: string[] = [];
  resp.events.forEach((ev) => {
    msgs.push(JSON.stringify(ev.event));
    msgs.push("=================================\n\n");
  });
  return msgs.join("\n");
}
