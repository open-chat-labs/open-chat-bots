/**
 * Demonstrates searching the Spotify api for a specific album
 */
import { Response } from "express";
import { getSpotifyAccessToken, searchSpotifyAlbums } from "./spotify";
import { argumentsInvalid } from "@open-ic/openchat-botclient-ts";
import { WithBotClient } from "../types";
import { success } from "./success";

export default async function (req: WithBotClient, res: Response) {
  // Obtain a reference to the BotClient
  const client = req.botClient;

  // Extract the value of the first command argument
  const album = client.stringArg("album");
  if (album === undefined) {
    res.status(400).send(argumentsInvalid());
  } else {
    // Send a placeholder message to OpenChat while we work ...
    const placeholder = await client.createTextMessage(
      false,
      "Searching Spotify ..."
    );
    client
      .sendMessage(placeholder)
      .catch((err) => console.error("sendTextMessage failed with: ", err));

    // Respond back to OpenChat with the same placeholder message.
    // OpenChat will treat this as an unconfirmed message until it
    // hears confirmation from the back end. This improves perceived performance.
    res.status(200).json(success(placeholder));

    // Perform the actual search using the Spotify api
    const token = await getSpotifyAccessToken();
    const item = await searchSpotifyAlbums(token, album);
    const url = item.external_urls.spotify;

    // Send the final result to the OpenChat backend
    client
      .sendTextMessage(true, url)
      .catch((err) => console.error("sendTextMessage failed with: ", err));
  }
}
