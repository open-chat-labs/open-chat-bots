import {
  BotClientFactory,
  ChatActionScope,
  chatIdentifierToInstallationLocation,
  InstallationLocation,
  InstallationRecord,
  OCErrorCode,
  Permissions,
} from "@open-ic/openchat-botclient-ts";
import { InstallationRegistry } from "./install_registry";

/**
 * This is class that will ping a message to OpenChat on a schedule when it is running and do nothing when it is not
 */
export class Ping {
  #timer: NodeJS.Timeout | undefined = undefined;
  #interval = 5000;
  #installs = new InstallationRegistry();
  #subscriptions = new Set<string>();

  constructor(private factory: BotClientFactory) {
    this.start();
  }

  async #pingScope(
    scope: ChatActionScope,
    apiGateway: string,
    permissions: Permissions
  ) {
    const client = this.factory.createClientInAutonomouseContext(
      scope,
      apiGateway,
      permissions
    );
    const msg = await client.createTextMessage(
      `Ping at ${new Date().toLocaleTimeString()}`
    );

    client
      .sendMessage(msg)
      .then((resp) => {
        if (
          resp.kind === "error" &&
          resp.code === OCErrorCode.InitiatorNotAuthorized
        ) {
          this.unsubscribe(scope);
        }
        return resp;
      })
      .catch((err) => console.error("Couldn't call ping", err));
  }

  subscribe(scope: ChatActionScope): boolean {
    const location = chatIdentifierToInstallationLocation(scope.chat);
    const installation = this.#installs.get(location);
    if (
      installation === undefined ||
      !installation.grantedAutonomousPermissions.hasMessagePermission("Text")
    ) {
      return false;
    }
    this.#subscriptions.add(scope.toString());
    return true;
  }

  install(location: InstallationLocation, record: InstallationRecord) {
    this.#installs.register(location, record);
    console.log("Installed bot in location: ", location);
  }

  unsubscribe(scope: ChatActionScope): boolean {
    const key = scope.toString();
    return this.#subscriptions.delete(key);
  }

  start() {
    clearInterval(this.#timer);
    this.#timer = setInterval(async () => {
      this.#subscriptions.forEach((scopeStr) => {
        const scope = ChatActionScope.fromString(scopeStr);
        if (scope.isChatScope()) {
          const location = chatIdentifierToInstallationLocation(scope.chat);
          const installation = this.#installs.get(location);
          if (
            installation !== undefined &&
            installation.grantedAutonomousPermissions.hasMessagePermission(
              "Text"
            )
          ) {
            this.#pingScope(
              scope,
              installation.apiGateway,
              installation.grantedAutonomousPermissions
            );
          }
        }
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
