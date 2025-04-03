import Json "mo:json";
import B "base";
import Principal "mo:base/Principal";
import Hash "mo:base/Hash";
import Result "mo:base/Result";
import Nat32 "mo:base/Nat32";
import Deserialize "deserialization";

module {
    public type Chat = {
        #Direct : B.CanisterId;
        #Group : B.CanisterId;
        #Channel: (B.CanisterId, B.ChannelId);
    };

    public func channelId(chat : Chat) : ?B.ChannelId {
        switch (chat) {
            case (#Direct(_)) null;
            case (#Group(_)) null;
            case (#Channel(_, channelId)) ?channelId;
        };
    };

    public func equal(a : Chat, b : Chat) : Bool {
        switch (a, b) {
            case (#Direct(aId), #Direct(bId)) {
                aId == bId;
            };
            case (#Group(aId), #Group(bId)) {
                aId == bId;
            };
            case (#Channel(aCanister, aChannel), #Channel(bCanister, bChannel)) {
                aCanister == bCanister and aChannel == bChannel;
            };
            case (_, _) {
                false;
            };
        };
    };

    public func hash(a : Chat) : Hash.Hash {
        switch (a) {
            case (#Direct(id)) {
                Principal.hash(id);
            };
            case (#Group(id)) {
                Principal.hash(id);
            };
            case (#Channel(canister, channel)) {
                let canisterHash = Principal.hash(canister);
                canisterHash ^ channel;
            };
        };
    };

    public func deserialize(chatVariantJson : (Text, Json.Json)) : Result.Result<Chat, Text> {
        Des.deserializeChat(chatVariantJson);
    };

    module Des {
        public func deserializeChat(chatVariantJson : (Text, Json.Json)) : Result.Result<Chat, Text> {
            let (chatType, chatTypeValue) = chatVariantJson;
            let chat : Chat = switch (chatType) {
                case ("Direct") switch (Deserialize.principal(chatTypeValue, "")) {
                    case (#ok(p)) #Direct(p);
                    case (#err(e)) return #err("Invalid 'Direct' chat value: " # debug_show (e));
                };
                case ("Group") switch (Deserialize.principal(chatTypeValue, "")) {
                    case (#ok(p)) #Group(p);
                    case (#err(e)) return #err("Invalid 'Group' chat value: " # debug_show (e));
                };
                case ("Channel") {
                    let channelPrincipal = switch (Deserialize.principal(chatTypeValue, "[0]")) {
                        case (#ok(v)) v;
                        case (#err(e)) return #err("Invalid 'Channel' chat value: " # debug_show (e));
                    };
                    let channelId = switch (Json.getAsNat(chatTypeValue, "[1]")) {
                        case (#ok(v)) Nat32.fromNat(v);
                        case (#err(e)) return #err("Invalid 'Channel' chat value: " # debug_show (e));
                    };
                    #Channel((channelPrincipal, channelId));
                };
                case (_) return #err("Invalid 'chat' field variant type: " # chatType);
            };
            #ok(chat);
        };
    };
}