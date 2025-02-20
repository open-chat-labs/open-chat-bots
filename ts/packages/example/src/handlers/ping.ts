import { BotClientFactory } from "@open-ic/openchat-botclient-ts";

/**
 * This is class that will ping a message to OpenChat on a schedule when it is running and do nothing when it is not
 */
export class Ping {
  #timer: NodeJS.Timeout | undefined = undefined;
  #interval = 5000;
  #apiKeys = new Set<string>();

  constructor(private factory: BotClientFactory) {
    this.start();
  }

  async #pingScope(apiKey: string) {
    const client = this.factory.createClientFromApiKey(apiKey);
    if (client.scope.kind === "community") {
      console.log("We can't send a text message to a community - skipping key");
    } else {
      const msg = await client.createTextMessage(
        `Ping at ${new Date().toLocaleTimeString()}`
      );
      client
        .sendMessage(msg)
        .catch((err) => console.error("Couldn't call ping", err));
    }
  }

  setApiKey(apiKey: string) {
    this.#apiKeys.add(apiKey);
  }

  start() {
    clearInterval(this.#timer);
    this.#timer = setInterval(async () => {
      this.#apiKeys.forEach((apiKey) => {
        this.#pingScope(apiKey);
      });
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
  })
);
