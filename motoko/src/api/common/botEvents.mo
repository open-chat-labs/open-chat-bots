import B "base";
import Chat "chat";
import ChatEvents "chatEvents";
import CommunityEvents "communityEvents";
import Env "../../env";
import Http "../../http";
import InstallationLocation "installationLocation";
import Permissions "permissions";
import Text "mo:base/Text";
import Result "mo:base/Result";
import Blob "mo:base/Blob";
import Ecdsa "mo:ecdsa";
import Sha256 "mo:sha2/Sha256";
import BaseX "mo:base-x-encoder";

module {
    type ChatEvent = ChatEvents.ChatEvent;
    type CommunityEvent = CommunityEvents.CommunityEvent;
    type InstallationLocation = InstallationLocation.InstallationLocation; 
    type Permissions = Permissions.RawPermissions;

    public type BotEventWrapper = {
        api_gateway : B.CanisterId;
        event : BotEvent;
        timestamp : B.TimestampMillis;
    };

    public type BotEvent = {
        #Chat : BotChatEvent;
        #Community : BotCommunityEvent;
        #Lifecycle : BotLifecycleEvent;
    };

    public type BotChatEvent = {
        event : ChatEvent;
        chat : Chat.Chat;
        thread : ?B.MessageIndex;
        event_index : B.EventIndex;
        latest_event_index : B.EventIndex;
    };

    public type BotCommunityEvent = {
        event : CommunityEvent;
        community_id : B.CommunityId;
        event_index : B.EventIndex;
        latest_event_index : B.EventIndex;
    };

    public type BotLifecycleEvent = {
        #Registered : BotRegisteredEvent;
        #Installed : BotInstalledEvent;
        #Uninstalled : BotUninstalledEvent;
    };

    public type BotRegisteredEvent = {
        bot_id : B.UserId;
        bot_name : Text;
    };

    public type BotInstalledEvent = {
        installed_by : B.UserId;
        location : InstallationLocation;
        granted_command_permissions : Permissions;
        granted_autonomous_permissions : Permissions;
    };

    public type BotUninstalledEvent = {
        uninstalled_by : B.UserId;
        location : InstallationLocation;
    };

    public func parseRequest(request : Http.Request, ocPublicKey : Ecdsa.PublicKey) : Result.Result<BotEventWrapper, Text> {
        // Extract signature from header
        let ?signature = Http.requestHeader(request, "x-oc-signature") else {
            return #err "Missing x-oc-signature header";
        };

        // Decode signature from base64
        let signatureBytes = switch (BaseX.fromBase64(signature)) {
            case (#err(e)) return #err("Failed to decode signature base64 value '" # signature # "'. Error: " # e);
            case (#ok(signatureBytes)) Blob.fromArray(signatureBytes);
        };

        // Verify the signature
        if (not verifyEcdsaSignature(request.body, ocPublicKey, signatureBytes)) {
            return #err "Invalid x-oc-signature";
        };

        // Candid decode the payload
        let eventWrapperOption : ?BotEventWrapper = from_candid(request.body);
        let ?eventWrapper = eventWrapperOption else {
            return #err "Failed to candid decode event wrapper";
        };

        // Check that the event timestamp is recent (within the last 5 minutes)
        let now = Env.nowMillis();
        if (now > eventWrapper.timestamp + 5 * 60 * 1000) {
            return #err "Event timestamp is not recent";
        };

        return #ok eventWrapper;
    };

    private func verifyEcdsaSignature(
        data : Blob,
        publicKey : Ecdsa.PublicKey,
        signature : Blob,
    ) : Bool {
        let #ok(sig) = Ecdsa.signatureFromBytes(signature.vals(), publicKey.curve, #raw) else return false;
        let hash = Sha256.fromBlob(#sha256, data);
        publicKey.verifyHashed(hash.vals(), sig);
    };
};
