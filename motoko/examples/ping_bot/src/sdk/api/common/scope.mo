import B "base";

module {
    public type ActionScope = {
        #Chat : Chat;
        #Community : B.CanisterId;
    };

    public type BotCommandScope = {
        #Chat : BotActionChatDetails;
        #Community : BotActionCommunityDetails;
    };

    public type BotActionChatDetails = {
        chat : Chat;
        thread : ?B.MessageIndex;
        message_id  : B.MessageId;
        user_message_id : ?B.MessageId;
    };

    public type BotActionCommunityDetails = {
        community_id : B.CanisterId;
    };

    public type Chat = {
        #Direct : B.CanisterId;
        #Group : B.CanisterId;
        #Channel: (B.CanisterId, B.ChannelId);
    };

    public func messageId(scope : BotCommandScope) : ?B.MessageId {
        switch (scope)  {
            case (#Chat(details)) {
                ?details.message_id;
            };
            case (#Community(_)) {
                null;
            };
        };
    };

    public func thread(scope : BotCommandScope) : ?B.MessageIndex {
        switch (scope)  {
            case (#Chat(details)) {
                details.thread;
            };
            case (#Community(_)) {
                null;
            };
        };
    };
    
// impl Chat {
//     pub fn channel_id(&self) -> Option<ChannelId> {
//         match self {
//             Chat::Channel(_, channel_id) => Some(*channel_id),
//             _ => None,
//         }
//     }

//     pub fn canister_id(&self) -> CanisterId {
//         match self {
//             Chat::Direct(canister_id) => *canister_id,
//             Chat::Group(canister_id) => *canister_id,
//             Chat::Channel(canister_id, _) => *canister_id,
//         }
//     }
// }

// impl BotCommandScope {
//     pub fn message_id(&self) -> Option<MessageId> {
//         match self {
//             BotCommandScope::Chat(details) => Some(details.message_id),
//             BotCommandScope::Community(_) => None,
//         }
//     }

//     pub fn thread(&self) -> Option<MessageIndex> {
//         match self {
//             BotCommandScope::Chat(details) => details.thread,
//             BotCommandScope::Community(_) => None,
//         }
//     }

//     pub fn path(&self) -> String {
//         match self {
//             BotCommandScope::Community(details) => format!("/community/{}", details.community_id),
//             BotCommandScope::Chat(details) => match details.chat {
//                 Chat::Channel(community_id, channel_id) => {
//                     format!("/community/{}/channel/{}", community_id, channel_id)
//                 }
//                 Chat::Direct(chat_id) => format!("/user/{}", chat_id),
//                 Chat::Group(chat_id) => format!("/group/{}", chat_id),
//             },
//         }
//     }
// }

}