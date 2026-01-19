import {
    BotClientFactory,
    ChatActionScope,
    chatIdentifierToInstallationLocation,
    InstallationLocation,
    InstallationRecord,
    InstallationRegistry,
    OCErrorCode,
    Permissions,
} from "@open-ic/openchat-botclient-ts";
import { factory as clientFactory } from "../factory";

/**
 * This is class that will ping a message to OpenChat on a schedule when it is running and do nothing when it is not
 */
export class Ping {
    #timer: NodeJS.Timeout | undefined = undefined;
    #interval = 5000;
    #installs = new InstallationRegistry();
    #subscriptions = new Set<string>();

    constructor(private factory: BotClientFactory) {}

    async #pingScope(scope: ChatActionScope, apiGateway: string, permissions: Permissions) {
        const client = this.factory.createClientInAutonomouseContext(
            scope,
            apiGateway,
            permissions,
        );
        const msg = await client.createTextMessage(`Ping at ${new Date().toLocaleTimeString()}`);

        client
            .sendMessage(msg)
            .then((resp) => {
                if (resp.kind === "error" && resp.code === OCErrorCode.InitiatorNotAuthorized) {
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
        this.#installs.set(location, record);
        console.log("Installed bot in location: ", location);
    }

    uninstall(location: InstallationLocation, uninstalledAt: bigint) {
        this.#installs.delete(location, uninstalledAt);
        console.log("Uninstalled bot from location: ", location);
    }

    unsubscribe(scope: ChatActionScope): boolean {
        const key = scope.toString();
        return this.#subscriptions.delete(key);
    }

    start() {
        this.loadInstallations();

        clearInterval(this.#timer);
        this.#timer = setInterval(async () => {
            this.#subscriptions.forEach((scopeStr) => {
                const scope = ChatActionScope.fromString(scopeStr);
                if (scope.isChatScope()) {
                    const location = chatIdentifierToInstallationLocation(scope.chat);
                    const installation = this.#installs.get(location);
                    if (
                        installation !== undefined &&
                        installation.grantedAutonomousPermissions.hasMessagePermission("Text")
                    ) {
                        this.#pingScope(
                            scope,
                            installation.apiGateway,
                            installation.grantedAutonomousPermissions,
                        );
                    }
                }
            });
        }, this.#interval);
    }

    stop() {
        clearInterval(this.#timer);
    }

    private loadInstallations(): Promise<boolean> {
        return this.factory
            .createGlobalClient()
            .installationEvents()
            .then((resp) => {
                if (resp.kind === "success") {
                    for (const event of resp.events) {
                        switch (event.kind) {
                            case "installed":
                                this.install(
                                    event.location,
                                    new InstallationRecord(
                                        event.apiGateway,
                                        event.grantedAutonomousPermissions,
                                        event.grantedCommandPermissions,
                                        event.installedAt,
                                    ),
                                );
                                break;
                            case "uninstalled":
                                this.uninstall(event.location, event.uninstalledAt);
                                break;
                        }
                    }
                    console.log(`Loaded ${resp.events.length} installation events from user index`);
                    return true;
                } else {
                    console.log("Failed to load installations: ", resp);
                    return false;
                }
            });
    }
}

export const ping = new Ping(clientFactory);

ping.start();
