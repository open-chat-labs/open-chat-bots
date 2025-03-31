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
}