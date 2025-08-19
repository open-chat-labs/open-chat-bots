import B "../common/base";
import Chat "../common/chat";
import ChatEvents "../common/chatEvents";
import CommunityEvents "../common/communityEvents";
import InstallationLocation "../common/installationLocation";
import Permissions "../common/permissions";
import Text "mo:base/Text";
import Result "mo:base/Result";
import Blob "mo:base/Blob";
import Ecdsa "mo:ecdsa";
import Json "mo:json";
import JWT "mo:jwt";
import Base64 "mo:base64";

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

    public func parseJwt(payload : Blob, ocPublicKey : Ecdsa.PublicKey) : Result.Result<BotEventWrapper, Text> {
        let ?jwt = Text.decodeUtf8(payload) else {
            return #err "Invalid UTF-8 encoding";
        };

        let token = switch (JWT.parse(jwt)) {
            case (#ok(token)) token;
            case (#err(e)) return #err ("Failed to parse JWT: " # debug_show (e));
        };

        if (JWT.getPayloadValue(token, "claim_type") != ?#string("BotEventCandid")) {
            return #err "Invalid claim type";
        };

        switch (
            JWT.validate(
                token,
                {
                    expiration = true;
                    notBefore = true;
                    issuer = #skip;
                    audience = #skip;
                    signature = #key(#ecdsa(ocPublicKey));
                },
            )
        ) {
            case (#ok()) {};
            case (#err(e)) {
                return #err ("Invalid JWT signature: " # debug_show (e));
            };
        };

        // Extract the 'payload' field from the JWT 
        let payloadText = switch (Json.getAsText(Json.obj(token.payload), "payload")) {
            case (#ok(payload)) payload;
            case (#err(e)) return #err ("Invalid 'payload' field: " # debug_show (e));
        };

        // Base64 decode the payload
        let base64Engine = Base64.Base64(#v(Base64.V2), ?false);
        let candidPayload = Blob.fromArray(base64Engine.decode(payloadText));

        // Candid decode the payload
        let eventWrapperOption : ?BotEventWrapper = from_candid(candidPayload);
        switch (eventWrapperOption) {
            case (?eventWrapper) {
                #ok eventWrapper;
            };
            case null {
                #err "Failed to candid decode event wrapper";
            };
        };
    };
};
