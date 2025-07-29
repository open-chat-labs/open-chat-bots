import Iter "mo:base/Iter";
import Set "mo:base/TrieSet";
import Text "mo:base/Text";
import InstallationRegistry "mo:openchat-bot-sdk/installationRegistry";
import InstallationLocation "mo:openchat-bot-sdk/api/common/installationLocation";
import B "mo:openchat-bot-sdk/api/common/base";

module {
    type InstallationLocation = InstallationLocation.InstallationLocation;
    type InstallationRecord = InstallationRegistry.InstallationRecord;

    public type State = {
        var botId : ?B.CanisterId;
        bannedWordsLower : Set.Set<Text>;
        installationRegistry: InstallationRegistry.InstallationRegistry;
    };

    public type StableState = {
        botId : ?B.UserId;
        bannedWordsLower : [Text];
        installations : [(InstallationLocation, InstallationRecord)];
    };

    public func new() : StableState {
        {
            botId = null;
            bannedWordsLower = ["cunt", "nigger"];
            installations = [];
        };
    };

    public func fromStable<system>(state : StableState) : State {
        {
            var botId = state.botId;
            bannedWordsLower = Set.fromArray(state.bannedWordsLower, Text.hash, Text.equal);
            installationRegistry = InstallationRegistry.InstallationRegistry(state.installations);
        };
    };

    public func toStable(state : State) : StableState {
        {
            botId = state.botId;
            bannedWordsLower = Set.toArray(state.bannedWordsLower);
            installations = state.installationRegistry.entries() |> Iter.toArray(_);
        };
    };
};
