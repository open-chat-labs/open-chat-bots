import Debug "mo:base/Debug";
import Definition "definition";
import Events "events";
import Http "mo:http-types";
import InstallationEvents "mo:openchat-bot-sdk/installationEvents";
import Nat "mo:base/Nat";
import Permissions "mo:openchat-bot-sdk/api/common/permissions";
import Principal "mo:base/Principal";
import Sdk "mo:openchat-bot-sdk";
import State "state";
import Timer "mo:base/Timer";

persistent actor class ModeratorBot(key : Text) {
    var stableState = State.new();

    transient let ocPublicKey = Sdk.parsePublicKeyOrTrap(key);
    transient var state = State.fromStable<system>(stableState);

    transient let router = Sdk.Http.Router()
        .get("/*", Definition.handler())
        .post("/notify", Events.handler(state, ocPublicKey));

    public query func http_request(request : Http.Request) : async Http.Response {
        router.handleQuery(request);
    };

    public func http_request_update(request : Http.UpdateRequest) : async Http.UpdateResponse {
        await router.handleUpdate(request);
    };

    system func preupgrade() {
        stableState := State.toStable(state);
    };

    private func onInitOrUpgrade<system>() {
        ignore Timer.setTimer<system>(#seconds 0, func () : async () {
            let userIndexCanisterId = Principal.fromText("vizcg-th777-77774-qaaea-cai");
            ignore InstallationEvents.load(userIndexCanisterId, func (botId, events) {
                Debug.print("Loaded " # Nat.toText(events.size()) # " events");
                for (event in events.vals()) {
                    switch (event) {
                        case (#Installed e) {
                            state.installationRegistry.insert(e.location, {
                                apiGateway = e.api_gateway;
                                grantedCommandPermissions = Permissions.fromRaw(e.granted_permissions);
                                grantedAutonomousPermissions = Permissions.fromRaw(e.granted_autonomous_permissions);
                                lastUpdated = e.timestamp;
                            });
                        };
                        case (#Uninstalled e) {
                            state.installationRegistry.remove(e.location, e.timestamp);
                        };
                    };
                };

                state.botId := ?botId;
            });
        });
    };

    onInitOrUpgrade<system>();
};
