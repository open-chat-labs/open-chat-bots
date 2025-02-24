import {
  BotClientFactory,
  MergedActionScope,
  ActionScopeToApiKeyMap,
} from "@open-ic/openchat-botclient-ts";

/**
 * This is class that will ping a message to OpenChat on a schedule when it is running and do nothing when it is not
 */
export class Ping {
  #timer: NodeJS.Timeout | undefined = undefined;
  #interval = 5000;
  #apiKeys = new ActionScopeToApiKeyMap();
  #subscriptions = new Map<string, Set<string>>();

  constructor(private factory: BotClientFactory) {
    this.start();
  }

  async #pingScope(apiKey: string, scope: MergedActionScope) {
    const client = this.factory.createClientFromApiKey(apiKey);
    const msg = await client.createTextMessage(
      `Ping at ${new Date().toLocaleTimeString()}`
    );

    if (client.scope.isCommunityScope()) {
      if (
        scope.isChatScope() &&
        scope.chat.isChannel() &&
        scope.chat.communityId === client.scope.communityId.communityId
      ) {
        msg.setChannelId(scope.chat.channelId);
      } else {
        console.log(
          "We can't send a text message to a community - skipping key"
        );
        return;
      }
    }
    client
      .sendMessage(msg)
      .then((resp) => {
        if (resp.kind === "not_authorized") {
          // this key is probably revoked so let's remove the subscription
          this.#apiKeys.delete(client.scope);
          this.unsubscribe(client.scope);
        }
        return resp;
      })
      .catch((err) => console.error("Couldn't call ping", err));
  }

  subscribe(scope: MergedActionScope): boolean {
    const key = this.#apiKeys.getAndDecode(scope);
    if (key && key.hasMessagePermission("Text")) {
      const current = this.#subscriptions.get(key.encoded) ?? new Set();
      current.add(scope.toString());
      this.#subscriptions.set(key.encoded, current);
      return true;
    }
    return false;
  }

  setApiKey(apiKey: string) {
    this.#apiKeys.set(apiKey);
  }

  unsubscribe(scope: MergedActionScope): boolean {
    const key = this.#apiKeys.get(scope);
    if (key) {
      const current = this.#subscriptions.get(key);
      if (current) {
        current.delete(scope.toString());
        this.#subscriptions.set(key, current);
        if (current.size === 0) {
          this.#subscriptions.delete(key);
        }
      }
      return true;
    }
    return false;
  }

  start() {
    clearInterval(this.#timer);
    this.#timer = setInterval(async () => {
      this.#subscriptions.forEach((scopes, apiKey) => {
        scopes.forEach((scope) => {
          this.#pingScope(apiKey, MergedActionScope.fromString(scope));
        });
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

ping.start();
