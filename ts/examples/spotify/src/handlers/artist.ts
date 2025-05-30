import { Response } from "express";
import { getSpotifyAccessToken, searchSpotifyArtists } from "./spotify";
import { argumentsInvalid } from "@open-ic/openchat-botclient-ts";
import { WithBotClient } from "../types";
import { success } from "./success";

export default async function (req: WithBotClient, res: Response) {
  const client = req.botClient;
  const artist = client.stringArg("artist");
  if (artist === undefined) {
    const ephemeral = (
      await client.createTextMessage(
        "You must provide a value for the artist parameter"
      )
    ).makeEphemeral();
    res.status(200).json(success(ephemeral));
  } else {
    const placeholder = (
      await client.createTextMessage(`Searching Spotify for ${artist} ...`)
    ).setFinalised(false);

    client
      .sendMessage(placeholder)
      .catch((err) => console.error("sendMessage failed with: ", err));

    res.status(200).json(success(placeholder));

    const token = await getSpotifyAccessToken();
    const item = await searchSpotifyArtists(token, artist);
    const url = item.external_urls.spotify;

    const finalMsg = (await client.createTextMessage(url)).setFinalised(true);
    client
      .sendMessage(finalMsg)
      .catch((err) => console.error("sendMessage failed with: ", err));
  }
}
