import B "base";
import Hash "mo:base/Hash";
import Principal "mo:base/Principal";

module {
    public type InstallationLocation = {
        #Community : B.CanisterId;
        #Group : B.CanisterId;
        #User : B.CanisterId;
    };

    public type InstallationLocationType = {
        #Community;
        #Group;
        #User;
    };

    public func equal(a : InstallationLocation, b : InstallationLocation) : Bool {
        switch (a, b) {
            case (#Community(aId), #Community(bId)) {
                aId == bId;
            };
            case (#Group(aId), #Group(bId)) {
                aId == bId;
            };
            case (#User(aId), #User(bId)) {
                aId == bId;
            };
            case (_, _) {
                false;
            };
        }
    };

    public func hash(a : InstallationLocation) : Hash.Hash {
        switch (a) {
            case (#Group(id)) {
                Principal.hash(id);
            };
            case (#Community(id)) {
                Principal.hash(id);
            };
            case (#User(id)) {
                Principal.hash(id);
            };
        };
    };
};
