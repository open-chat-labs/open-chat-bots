import ActionContext "api/bot/actionContext";
import B "api/common/base";
import E "api/common/eventTypes";
import MessageContent "api/common/messageContent";
import MemberType "api/common/memberType";
import ChatEventsApi "api/oc/chatEvents";
import ChatSummary "client/chatSummary";
import ChatEvents "client/chatEvents";
import CommunityEventsApi "api/oc/communityEvents";
import CommunityEvents "client/communityEvents";
import CreateChannel "client/createChannel";
import DeleteChannel "client/deleteChannel";
import DeleteMessages "client/deleteMessages";
import SendMessage "client/sendMessage";
import AddReaction "client/addReaction";
import CommunitySummary "client/communitySummary";
import InviteUsers "client/inviteUsers";
import RemoveUser "client/removeUser";
import Members "client/members";

module {
    public class OpenChatClient(context : ActionContext.ActionContext) {
        public func sendMessage(content : MessageContent.MessageContentInitial) : SendMessage.Builder {
            SendMessage.Builder(context, content);
        };

        public func sendTextMessage(text : Text) : SendMessage.Builder {
            sendMessage(#Text { text = text });
        };

        public func addReaction(messageId : B.MessageId, reaction : Text) : AddReaction.Builder {
            AddReaction.Builder(context, messageId, reaction);
        };

        public func deleteMessages(messageIds : [B.MessageId]) : DeleteMessages.Builder {
            DeleteMessages.Builder(context, messageIds);
        };

        public func inviteUsers(userIds : [B.UserId]) : InviteUsers.Builder {
            InviteUsers.Builder(context, userIds);
        };

        public func removeUser(userId : B.UserId) : RemoveUser.Builder {
            RemoveUser.Builder(context, userId);
        };

        public func createChannel(name : Text, isPublic : Bool) : CreateChannel.Builder {
            CreateChannel.Builder(context, name, isPublic);
        };

        public func deleteChannel(channelId : B.ChannelId) : DeleteChannel.Builder {
            DeleteChannel.Builder(context, channelId);
        };

        public func chatSummary() : ChatSummary.Builder {
            ChatSummary.Builder(context);
        };

        public func communitySummary() : CommunitySummary.Builder {
            CommunitySummary.Builder(context);
        };

        public func chatEvents(events : ChatEventsApi.EventsSelectionCriteria) : ChatEvents.Builder {
            ChatEvents.Builder(context, events);
        };

        public func communityEvents(events : CommunityEventsApi.EventsSelectionCriteria) : CommunityEvents.Builder {
            CommunityEvents.Builder(context, events);
        };

        public func members(memberTypes : [MemberType.MemberType]) : Members.Builder {
            Members.Builder(context, memberTypes);
        };
    };
};
