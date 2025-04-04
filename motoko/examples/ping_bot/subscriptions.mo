import HashMap "mo:base/HashMap";
import Iter "mo:base/Iter";
import Timer "mo:base/Timer";
import Array "mo:base/Array";
import Result "mo:base/Result";
import Debug "mo:base/Debug";
import Chat "mo:openchat-bot-sdk/api/common/chat";
import Client "mo:openchat-bot-sdk/client";
import ApiKeyContext "mo:openchat-bot-sdk/api/bot/apiKeyContext";

module {
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
        apiKey : Text;
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

            let record = {
                interval = sub.interval;
                timerId = Timer.recurringTimer<system>(#seconds(sub.interval), sendPing(sub.chat, sub.apiKey));
                apiKey = sub.apiKey;
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

        public func getAll() : [(Chat.Chat, Nat)] {
            map.entries() |> Iter.toArray(_)  |> Array.map(_, func ((c : Chat.Chat, r : Record)) : ((Chat.Chat, Nat)) {
                (c, r.interval);
            });
        };

        public func count() : Nat {
            map.size();
        };

        func sendPing(chat : Chat.Chat, apiKey : Text) : () -> async () {
            let ?apiKeyContext = ApiKeyContext.parse(apiKey) |> Result.toOption(_) else {
                Debug.trap("Invalid API Key");
            };
            let context = ApiKeyContext.toActionContext(apiKeyContext);
            let client = Client.AutonomousClient(context);
            
            func () : async () {
                ignore await client
                    .sendTextMessage("Ping!")
                    .withChannelId(Chat.channelId(chat))
                    .execute();
            };
        }
    };

    type Record = {
        interval : Nat;
        timerId : Timer.TimerId;
        apiKey : Text;
    };
}