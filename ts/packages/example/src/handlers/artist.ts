import { Response } from "express";
import { getSpotifyAccessToken, searchSpotifyArtists } from "./spotify";
import { argumentsInvalid } from "@open-ic/openchat-botclient-ts";
import { WithCommandChatClient } from "../types";
import { success } from "./success";

export default async function (req: WithCommandChatClient, res: Response) {
  const client = req.botClient;
  const artist = client.stringArg("artist");
  if (artist === undefined) {
    res.status(400).send(argumentsInvalid());
  } else {
    const placeholder = await client.createTextMessage(
      false,
      `Searching Spotify for ${artist} ...`
    );

    client
      .sendMessage(placeholder)
      .catch((err) => console.error("sendMessage failed with: ", err));

    res.status(200).json(success(placeholder));

    const token = await getSpotifyAccessToken();
    const item = await searchSpotifyArtists(token, artist);
    const url = item.external_urls.spotify;

    client
      .sendTextMessage(true, url)
      .catch((err) => console.error("sendTextMessage failed with: ", err));
  }
}
