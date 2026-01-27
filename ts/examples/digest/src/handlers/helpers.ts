import { BotClient, Message } from "@open-ic/openchat-botclient-ts";

export async function ephemeralMsg(
  client: BotClient,
  txt: string
): Promise<Message> {
  const msg = (await client.createTextMessage(txt))
    .makeEphemeral()
    .setFinalised(true);
  return msg;
}
