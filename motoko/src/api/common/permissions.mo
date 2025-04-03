import Json "mo:json";
import Result "mo:base/Result";
import Int "mo:base/Int";
import Nat32 "mo:base/Nat32";
import Buffer "mo:base/Buffer";
import Iter "mo:base/Iter";
import Nat "mo:base/Nat";
import Deserialize "deserialization";
import Array "../../utils/array";

module {
    public type Permissions = {
        chat : [GroupPermission];
        community : [CommunityPermission];
        message : [MessagePermission];
    };

    public type CommunityPermission = {
        #ChangeRoles;
        #UpdateDetails;
        #InviteUsers;
        #RemoveMembers;
        #CreatePublicChannel;
        #CreatePrivateChannel;
        #ManageUserGroups;
    };

    public type GroupPermission = {
        #ChangeRoles;
        #UpdateGroup;
        #AddMembers;
        #InviteUsers;
        #RemoveMembers;
        #DeleteMessages;
        #PinMessages;
        #ReactToMessages;
        #MentionAllMembers;
        #StartVideoCall;
    };

    public type MessagePermission = {
        #Text;
        #Image;
        #Video;
        #Audio;
        #File;
        #Poll;
        #Crypto;
        #Giphy;
        #Prize;
        #P2pSwap;
        #VideoCall;
    };

    public func textOnly() : Permissions {
        {
            chat = [];
            community = [];
            message = [#Text];
        };
    };

    public func serialize(permissions : Permissions) : Json.Json {
        Ser.serializePermissions(permissions);
    };

    public func deserialize(dataJson : Json.Json) : Result.Result<Permissions, Text> {
        Des.deserializePermissions(dataJson);
    };

    // Is 'b' a subset of 'a'
    public func isSubset(a : Permissions, b : Permissions) : Bool {
        Array.isSubset(a.community, b.community, communityEqual)
         and Array.isSubset(a.chat, b.chat, groupEqual)
         and Array.isSubset(a.message, b.message, messageEqual);
    };

    private func communityEqual(a : CommunityPermission, b : CommunityPermission) : Bool { a == b };
    private func groupEqual(a : GroupPermission, b : GroupPermission) : Bool { a == b };
    private func messageEqual(a : MessagePermission, b : MessagePermission) : Bool { a == b };
    
    module Ser {
        public func serializePermissions(permissions : Permissions) : Json.Json {
            let encodedCommunityPermissions = encodePermissions(
                permissions.community,
                encodeCommunityPermission,
            );

            let encodedChatPermissions = encodePermissions(
                permissions.chat,
                encodeGroupPermission,
            );

            let encodedMessagePermissions = encodePermissions(
                permissions.message,
                encodeMessagePermission,
            );

            #object_([
                ("community", encodedCommunityPermissions),
                ("chat", encodedChatPermissions),
                ("message", encodedMessagePermissions),
            ]);
        };

        private func encodePermissions<T>(permissions : [T], getEncodedValue : T -> Nat) : Json.Json {
            var encoded : Nat32 = 0;

            for (permission in permissions.vals()) {
                let encodedValue = getEncodedValue(permission);
                encoded := encoded | Nat32.pow(2, Nat32.fromNat(encodedValue));
            };
            if (encoded == 0) {
                return #null_;
            };

            #number(#int(Int.abs(Nat32.toNat(encoded))));
        };

        private func encodeCommunityPermission(permission : CommunityPermission) : Nat {
            switch (permission) {
                case (#ChangeRoles) 0;
                case (#UpdateDetails) 1;
                case (#InviteUsers) 2;
                case (#RemoveMembers) 3;
                case (#CreatePublicChannel) 4;
                case (#CreatePrivateChannel) 5;
                case (#ManageUserGroups) 6;
            };
        };

        private func encodeGroupPermission(permission : GroupPermission) : Nat {
            switch (permission) {
                case (#ChangeRoles) 0;
                case (#UpdateGroup) 1;
                case (#AddMembers) 2;
                case (#InviteUsers) 3;
                case (#RemoveMembers) 4;
                case (#DeleteMessages) 5;
                case (#PinMessages) 6;
                case (#ReactToMessages) 7;
                case (#MentionAllMembers) 8;
                case (#StartVideoCall) 9;
            };
        };

        private func encodeMessagePermission(permission : MessagePermission) : Nat {
            switch (permission) {
                case (#Text) 0;
                case (#Image) 1;
                case (#Video) 2;
                case (#Audio) 3;
                case (#File) 4;
                case (#Poll) 5;
                case (#Crypto) 6;
                case (#Giphy) 7;
                case (#Prize) 8;
                case (#P2pSwap) 9;
                case (#VideoCall) 10;
            };
        };
    };

    module Des {
        public func deserializePermissions(dataJson : Json.Json) : Result.Result<Permissions, Text> {
            func getPermissions<T>(name : Text, getPermission : Nat -> ?T, deserializePermission : Json.Json -> Result.Result<T, Text>) : Result.Result<[T], Text> {
                switch (Json.get(dataJson, name)) {
                    case (?#number(#int(encodedPermissions))) switch (decodePermissions<T>(encodedPermissions, getPermission)) {
                        case (#ok(v)) #ok(v);
                        case (#err(e)) #err("Invalid '" # name # "' BotPermission field: " # e);
                    };
                    case (?#array(permissions)) switch (Deserialize.arrayOfValues(permissions, deserializePermission)) {
                        case (#ok(v)) #ok(v);
                        case (#err(e)) #err("Invalid '" # name # "' field: " # e);
                    };
                    case (null) #ok([]); // No permissions
                    case (_) #err("'" # name # "' BotPermission field not found: ");
                };
            };

            let communityPermissions = switch (
                getPermissions<CommunityPermission>(
                    "community",
                    decodeCommunityPermission,
                    deserializeCommunityPermission,
                )
            ) {
                case (#ok(permssions)) permssions;
                case (#err(e)) return #err(e);
            };

            let chatPermissions = switch (
                getPermissions<GroupPermission>(
                    "chat",
                    decodeGroupPermission,
                    deserializeGroupPermission,
                )
            ) {
                case (#ok(permssions)) permssions;
                case (#err(e)) return #err(e);
            };

            let messagePermissions = switch (
                getPermissions<MessagePermission>(
                    "message",
                    decodeMessagePermission,
                    deserializeMessagePermission,
                )
            ) {
                case (#ok(permssions)) permssions;
                case (#err(e)) return #err(e);
            };

            #ok({
                community = communityPermissions;
                chat = chatPermissions;
                message = messagePermissions;
            });
        };

        private func decodePermissions<T>(encodedPermissions : Int, getPermission : Nat -> ?T) : Result.Result<[T], Text> {
            if (encodedPermissions < 0) {
                return #err("Invalid encoded permissions value: " # Int.toText(encodedPermissions));
            };
            let encodedPermissionNat = Int.abs(encodedPermissions);
            if (encodedPermissionNat > 4294967295) {
                return #err("Invalid encoded permissions value: " # Nat.toText(encodedPermissionNat));
            };
            var encodedPermissionsNat32 = Nat32.fromNat(encodedPermissionNat);
            let permissions = Buffer.Buffer<T>(0);
            label f for (i in Iter.range(0, 32)) {
                if (encodedPermissionsNat32 == 0) {
                    break f;
                };
                let flag = Nat32.pow(2, Nat32.fromNat(i));
                if (encodedPermissionsNat32 & flag == 0) {
                    continue f; // Permission not set
                };
                encodedPermissionsNat32 := encodedPermissionsNat32 & ^flag;
                switch (getPermission(i)) {
                    case (?permission) permissions.add(permission);
                    case (null) return #err("Invalid encoded permission value: " # Nat.toText(i));
                };
            };

            #ok(Buffer.toArray(permissions));
        };

        private func decodeCommunityPermission(encodedPermission : Nat) : ?CommunityPermission {
            let permission = switch (encodedPermission) {
                case (0) #ChangeRoles;
                case (1) #UpdateDetails;
                case (2) #InviteUsers;
                case (3) #RemoveMembers;
                case (4) #CreatePublicChannel;
                case (5) #CreatePrivateChannel;
                case (6) #ManageUserGroups;
                case (_) return null;
            };
            ?permission;
        };

        private func decodeGroupPermission(encodedPermission : Nat) : ?GroupPermission {
            let permission = switch (encodedPermission) {
                case (0) #ChangeRoles;
                case (1) #UpdateGroup;
                case (2) #AddMembers;
                case (3) #InviteUsers;
                case (4) #RemoveMembers;
                case (5) #DeleteMessages;
                case (6) #PinMessages;
                case (7) #ReactToMessages;
                case (8) #MentionAllMembers;
                case (9) #StartVideoCall;
                case (_) return null;
            };
            ?permission;
        };

        private func decodeMessagePermission(encodedPermission : Nat) : ?MessagePermission {
            let permission = switch (encodedPermission) {
                case (0) #Text;
                case (1) #Image;
                case (2) #Video;
                case (3) #Audio;
                case (4) #File;
                case (5) #Poll;
                case (6) #Crypto;
                case (7) #Giphy;
                case (8) #Prize;
                case (9) #P2pSwap;
                case (10) #VideoCall;
                case (_) return null;
            };
            ?permission;
        };

        private func deserializeMessagePermission(json : Json.Json) : Result.Result<MessagePermission, Text> {
            let #string(permissionString) = json else return #err("Invalid message permission, expected string value");

            let permission : MessagePermission = switch (permissionString) {
                case ("Text") #Text;
                case ("Image") #Image;
                case ("Video") #Video;
                case ("Audio") #Audio;
                case ("File") #File;
                case ("Poll") #Poll;
                case ("Crypto") #Crypto;
                case ("Giphy") #Giphy;
                case ("Prize") #Prize;
                case ("P2pSwap") #P2pSwap;
                case ("VideoCall") #VideoCall;
                case (_) return #err("Invalid message permission: " # permissionString);
            };
            #ok(permission);
        };

        private func deserializeGroupPermission(json : Json.Json) : Result.Result<GroupPermission, Text> {
            let #string(permissionString) = json else return #err("Invalid group permission, expected string value");

            let permission : GroupPermission = switch (permissionString) {
                case ("ChangeRoles") #ChangeRoles;
                case ("UpdateGroup") #UpdateGroup;
                case ("AddMembers") #AddMembers;
                case ("InviteUsers") #InviteUsers;
                case ("RemoveMembers") #RemoveMembers;
                case ("DeleteMessages") #DeleteMessages;
                case ("PinMessages") #PinMessages;
                case ("ReactToMessages") #ReactToMessages;
                case ("MentionAllMembers") #MentionAllMembers;
                case ("StartVideoCall") #StartVideoCall;
                case (_) return #err("Invalid group permission: " # permissionString);
            };
            #ok(permission);
        };

        private func deserializeCommunityPermission(json : Json.Json) : Result.Result<CommunityPermission, Text> {
            let #string(permissionString) = json else return #err("Invalid community permission, expected string value");

            let permission : CommunityPermission = switch (permissionString) {
                case ("ChangeRoles") #ChangeRoles;
                case ("UpdateDetails") #UpdateDetails;
                case ("InviteUsers") #InviteUsers;
                case ("RemoveMembers") #RemoveMembers;
                case ("CreatePublicChannel") #CreatePublicChannel;
                case ("CreatePrivateChannel") #CreatePrivateChannel;
                case ("ManageUserGroups") #ManageUserGroups;
                case (_) return #err("Invalid community permission: " # permissionString);
            };
            #ok(permission);
        };        
    };
}