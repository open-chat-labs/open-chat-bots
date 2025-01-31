import { Response } from "express";
import { getSpotifyAccessToken, searchSpotifySongs } from "./spotify";
import { argumentsInvalid } from "@open-ic/openchat-botclient-ts";
import { WithCommandChatClient } from "../types";
import { success } from "./success";

export default async function (req: WithCommandChatClient, res: Response) {
  const client = req.botClient;
  const song = client.stringArg("song");
  if (song === undefined) {
    res.status(400).send(argumentsInvalid());
  } else {
    const placeholder = await client.createTextMessage(
      false,
      "Searching Spotify ..."
    );

    client
      .sendMessage(placeholder)
      .catch((err: unknown) =>
        console.error("sendTextMessage failed with: ", err)
      );

    res.status(200).json(success(placeholder));

    const token = await getSpotifyAccessToken();
    const item = await searchSpotifySongs(token, song);
    const url = item.external_urls.spotify;

    client
      .sendTextMessage(true, url)
      .catch((err: unknown) => console.error("sendMessage failed with: ", err));
  }
}
