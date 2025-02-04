import { BotClientFactory } from "@open-ic/openchat-botclient-ts";

/**
 * This is class that will ping a message to OpenChat on a schedule when it is running and do nothing when it is not
 */
export class Ping {
  #timer: NodeJS.Timeout | undefined = undefined;
  #interval = 5000;

  constructor(private factory: BotClientFactory, private apiKey: string) {}

  start() {
    clearInterval(this.#timer);
    this.#timer = setInterval(async () => {
      const client = await this.factory.createClientFromApiKey(this.apiKey);
      client
        .sendTextMessage(true, `Ping at ${new Date().toLocaleTimeString()}`)
        .catch((err) => console.error("Couldn't call ping"));
    }, this.#interval);
  }

  stop() {
    clearInterval(this.#timer);
  }
}

export const ping = new Ping(
  new BotClientFactory({
    openchatPublicKey: process.env.OC_PUBLIC!,
    icHost: process.env.IC_HOST!,
    identityPrivateKey: process.env.IDENTITY_PRIVATE!,
    openStorageCanisterId: process.env.STORAGE_INDEX_CANISTER!,
  }),
  process.env.OC_API_KEY!
);
