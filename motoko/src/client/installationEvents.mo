import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import B "../api/common/base";
import InstallationEvents "../api/oc/installationEvents";

module {
    public class Builder(userIndexCanisterId : B.CanisterId) = this {
        var from : Nat32 = 0;
        var size : Nat16 = 5000;

        public func withFrom(value : Nat32) : Builder {
            from := value;
            this;
        };

        public func withSize(value : Nat16) : Builder {
            size := value;
            this;
        };

        public func execute() : async Result.Result<InstallationEvents.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(userIndexCanisterId)) : InstallationEvents.Actor;

            try {
                let response = await botApiActor.bot_installation_events({
                    from;
                    size;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };

    public type Result = Result.Result<InstallationEvents.Response, Error.Error>;
};
