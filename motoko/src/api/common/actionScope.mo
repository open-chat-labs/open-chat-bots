import Hash "mo:base/Hash";
import Principal "mo:base/Principal";

import B "base";
import Chat "chat";

module {
    public type ActionScope = {
        #Chat : Chat.Chat;
        #Community : B.CanisterId;
    };

    public func equal(a : ActionScope, b : ActionScope) : Bool {
        switch (a, b) {
            case (#Chat(aId), #Chat(bId)) {
                Chat.equal(aId, bId);
            };
            case (#Community(aId), #Community(bId)) {
                aId == bId;
            };
            case (_, _) {
                false;
            };
        };
    };

    public func hash(a : ActionScope) : Hash.Hash {
        switch (a) {
            case (#Chat(id)) {
                Chat.hash(id);
            };
            case (#Community(id)) {
                Principal.hash(id);
            };
        };
    };
};
