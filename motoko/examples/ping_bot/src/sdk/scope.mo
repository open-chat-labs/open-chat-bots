import T "lib";

module {
    public type BotCommandScope = {
        #Chat : BotActionChatDetails;
        #Community : BotActionCommunityDetails;
    };

    public type BotActionChatDetails = {
        chat : Chat;
        thread : ?T.MessageIndex;
        message_id  : T.MessageId;
        user_message_id : ?T.MessageId;
    };

    public type BotActionCommunityDetails = {
        community_id : T.CanisterId;
    };

    public type Chat = {
        #Direct : T.CanisterId;
        #Group : T.CanisterId;
        #Channel: (T.CanisterId, T.ChannelId);
    }

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