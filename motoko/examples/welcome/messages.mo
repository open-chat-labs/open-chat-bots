import HashMap "mo:base/HashMap";
import Iter "mo:base/Iter";
import Base "mo:openchat-bot-sdk/api/common/base";
import Chat "mo:openchat-bot-sdk/api/common/chat";

module {
    type Chat = Chat.Chat;
    type CommunityId = Base.CommunityId;
    type ChannelId = Base.ChannelId;

    public class WelcomeMessages(messages: [(Chat, Text)]) {
        var chats : HashMap.HashMap<Chat, Text> = HashMap.fromIter<Chat, Text>(messages.vals(), 10, Chat.equal, Chat.hash);

        public func get(chat : Chat) : ?Text {
            switch (chat) {
                case (#Channel(community_id, _)) {
                    switch (getForCommunity(community_id)) {
                        case (?(_, message)) ?message;
                        case null null;
                    };
                };
                case (_) chats.get(chat);
            };
        };

        public func getForCommunity(id : CommunityId) : ?(ChannelId, Text) {
            for ((chat, message) in chats.entries()) {
                switch (chat) {
                    case (#Channel(community_id, channel_id)) {
                        if (community_id == id) {
                            return ?(channel_id, message);
                        };
                    };
                    case (_) {};
                };
            };
            null;
        };

        public func set(chat : Chat, message : Text) {
            // Remove any existing welcome messages from the same community
            switch (Chat.communityId(chat)) {
                case (?community_id) {
                    removeCommunity(community_id);
                };
                case null {};
            };

            chats.put(chat, message);
        };

        public func remove(chat : Chat) : Bool {
            switch (chats.remove(chat)) {
                case (?_) true;
                case null false;
            };
        };

        public func removeCommunity(community_id : CommunityId) {
            for (chat in chats.keys()) {
                if (Chat.communityId(chat) == ?community_id) {
                    ignore chats.remove(chat);
                };
            };
        };

        public func getChats() : [Chat] {
            chats.keys() |> Iter.toArray(_);
        };

        public func entries() : Iter.Iter<(Chat, Text)> {
            chats.entries();
        };

        public func len() : Nat {
            chats.size();
        };
    };
};
