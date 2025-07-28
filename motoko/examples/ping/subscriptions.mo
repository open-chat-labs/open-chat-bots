import Debug "mo:base/Debug";
import HashMap "mo:base/HashMap";
import Iter "mo:base/Iter";
import Timer "mo:base/Timer";
import Base "mo:openchat-bot-sdk/api/common/base";
import Chat "mo:openchat-bot-sdk/api/common/chat";
import Client "mo:openchat-bot-sdk/client";

module {
    let maxIterations : Nat8 = 100;
    
    public func new<system>(subs : [Sub]) : ChatSubscriptions {
        var subscriptions = ChatSubscriptions();
        for (sub in subs.vals()) {
            ignore subscriptions.set<system>(sub);
        };
        subscriptions;
    };

    public type Sub = {
        chat : Chat.Chat;
        interval : Nat;
        apiGateway : Base.CanisterId;
        iterations : Nat8;
    };

    public class ChatSubscriptions() {
        var map = HashMap.HashMap<Chat.Chat, Record>(10, Chat.equal, Chat.hash);

        // Insert or update an interval for a chat and return true if it already existed
        public func set<system>(sub : Sub) : Bool {
            let exists = switch (map.get(sub.chat)) {
                case (?record) {
                    Timer.cancelTimer(record.timerId);
                    true;
                };
                case null false;
            };

            let record : Record = {
                interval = sub.interval;
                timerId = Timer.recurringTimer<system>(#seconds(sub.interval), sendPing(sub.chat, sub.apiGateway));
                apiGateway = sub.apiGateway;
                iterations = sub.iterations;
            };

            map.put(sub.chat, record);
            return exists;
        };

        public func remove(chat : Chat.Chat) {
            let ?record = map.get(chat) else {
                return;
            };
            Timer.cancelTimer(record.timerId);
            map.delete(chat);
        };

        public func iter() : Iter.Iter<Sub> {
            Iter.map(map.entries(), func((k : Chat.Chat, v : Record)) : Sub {{
                chat = k;
                interval = v.interval;
                apiGateway = v.apiGateway;
                iterations = v.iterations;
            }});
        };

        public func count() : Nat {
            map.size();
        };

        func sendPing(chat : Chat.Chat, apiGateway : Base.CanisterId) : () -> async () {
            let client = Client.OpenChatClient({
                apiGateway;
                scope = #Chat(chat);
                jwt = null;
                messageId = null;
                thread = null;
            });
            
            func () : async () {
                switch (map.get(chat)) {
                    case (?record) {
                        if (record.iterations >= maxIterations) {
                            Timer.cancelTimer(record.timerId);
                            map.delete(chat);
                            return;
                        };

                        let newRecord = {
                            interval = record.interval;
                            timerId = record.timerId;
                            apiGateway = record.apiGateway;
                            iterations = record.iterations + 1;
                        };

                        map.put(chat, newRecord);
                    };
                    case null {
                        Debug.print("Chat not found in subscriptions: " # debug_show(chat));
                    };
                };

                ignore await client
                    .sendTextMessage("Ping!")
                    .execute();
            };
        };
    };

    type Record = {
        interval : Nat;
        timerId : Timer.TimerId;
        apiGateway : Base.CanisterId;
        iterations : Nat8;
    };
};
