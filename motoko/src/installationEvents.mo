import Array "mo:base/Array";
import Base "api/common/base";
import Client "client";
import Debug "mo:base/Debug";
import I "api/oc/installationEvents";
import Nat16 "mo:base/Nat16";
import Timer "mo:base/Timer";

module {
    type EventsCallback = (Base.UserId, [I.BotInstallationEvent]) -> ();

    let pageSize : Nat16 = 5_000;

    public func load<system>(userIndexCanisterId: Base.CanisterId, callback : EventsCallback) : async () {
        ignore loadPage<system>(userIndexCanisterId, [], 0, callback);
    };

    func loadPage<system>(
        userIndexCanisterId: Base.CanisterId, 
        events: [I.BotInstallationEvent], 
        from : Nat32, 
        callback : EventsCallback) 
    : async () {
        let response = await Client.UserIndexClient(userIndexCanisterId)
            .installationEvents()
            .withFrom(from)
            .withSize(pageSize)
            .execute();

        switch (response) {
            case (#ok(#Success result)) {
                let count = result.events.size();
                let aggregatedEvents = Array.append(events, result.events);

                if (count == Nat16.toNat(pageSize)) {
                    ignore Timer.setTimer<system>(#seconds 0, func () : async () {
                        ignore loadPage<system>(
                            userIndexCanisterId, 
                            aggregatedEvents, 
                            from + Nat16.toNat32(pageSize), 
                            callback);
                    });                    
                } else {
                    callback(result.bot_id, aggregatedEvents);
                }
            };
            case other {
                Debug.print("Failed to load installation events: " # debug_show(other));
            };
        };
    };
};