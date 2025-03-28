import Json "mo:json";
import Nat32 "mo:base/Nat32";
import Int "mo:base/Int";

module {
    public type BotPermissions = {
        chat : [GroupPermission];
        community : [CommunityPermission];
        message : [MessagePermission];
    };

    public type CommunityPermission = {
        #changeRoles;
        #updateDetails;
        #inviteUsers;
        #removeMembers;
        #createPublicChannel;
        #createPrivateChannel;
        #manageUserGroups;
    };

    public type GroupPermission = {
        #changeRoles;
        #updateGroup;
        #addMembers;
        #inviteUsers;
        #removeMembers;
        #deleteMessages;
        #pinMessages;
        #reactToMessages;
        #mentionAllMembers;
        #startVideoCall;
    };

    public type MessagePermission = {
        #text;
        #image;
        #video;
        #audio;
        #file;
        #poll;
        #crypto;
        #giphy;
        #prize;
        #p2pSwap;
        #videoCall;
    };

    public func serializeBotPermissions(permissions : BotPermissions) : Json.Json {
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
            case (#changeRoles) 0;
            case (#updateDetails) 1;
            case (#inviteUsers) 2;
            case (#removeMembers) 3;
            case (#createPublicChannel) 4;
            case (#createPrivateChannel) 5;
            case (#manageUserGroups) 6;
        };
    };

    private func encodeGroupPermission(permission : GroupPermission) : Nat {
        switch (permission) {
            case (#changeRoles) 0;
            case (#updateGroup) 1;
            case (#addMembers) 2;
            case (#inviteUsers) 3;
            case (#removeMembers) 4;
            case (#deleteMessages) 5;
            case (#pinMessages) 6;
            case (#reactToMessages) 7;
            case (#mentionAllMembers) 8;
            case (#startVideoCall) 9;
        };
    };

    private func encodeMessagePermission(permission : MessagePermission) : Nat {
        switch (permission) {
            case (#text) 0;
            case (#image) 1;
            case (#video) 2;
            case (#audio) 3;
            case (#file) 4;
            case (#poll) 5;
            case (#crypto) 6;
            case (#giphy) 7;
            case (#prize) 8;
            case (#p2pSwap) 9;
            case (#videoCall) 10;
        };
    };
}