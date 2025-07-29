import Debug "mo:base/Debug";
import Text "mo:base/Text";
import Principal "mo:base/Principal";
import Option "mo:base/Option";
import Sdk "mo:openchat-bot-sdk";
import Client "mo:openchat-bot-sdk/client";
import B "mo:openchat-bot-sdk/api/common/base";
import Chat "mo:openchat-bot-sdk/api/common/chat";
import ResponseBuilder "mo:openchat-bot-sdk/http/responseBuilder";
import BotEvents "mo:openchat-bot-sdk/api/common/botEvents";
import State "state";

module {
    public func handler(state : State.State) : Sdk.Http.UpdateHandler {
        func (request : Sdk.Http.Request) : async Sdk.Http.Response {
            let eventWrapperOption : ?BotEvents.BotEventWrapper = from_candid(request.body);

            let ?eventWrapper = eventWrapperOption else {
                Debug.print("Cannot decode event: " # debug_show(request.body));
                return ResponseBuilder.badRequest("Cannot candid decode event");
            };

            switch (eventWrapper.event) {
                case (#Lifecycle lifecycleEvent) {
                    handleLifecycleEvent(lifecycleEvent, state);
                };
                case (#Chat chatEvent) {
                    await handleChatEvent(chatEvent, eventWrapper.api_gateway, state);
                };
                case (#Community communityEvent) {
                    await handleCommunityEvent(communityEvent, eventWrapper.api_gateway, state);
                };
            };

            return ResponseBuilder.success();
        };
    };

    func handleLifecycleEvent(lifecycleEvent : BotEvents.BotLifecycleEvent, state : State.State) {
        switch (lifecycleEvent) {
            case (#Uninstalled event) {
                switch (event.location) {
                    case (#Community communityId) {
                        state.messages.removeCommunity(communityId);
                    };
                    case (#Group chatId) {
                        ignore state.messages.remove(#Group(chatId));
                    };
                    case (#User(_)) {};
                };
            };
            case _ {};
        };
    };

    func handleChatEvent(chatEvent : BotEvents.BotChatEvent, apiGateway: B.CanisterId, state : State.State) : async () {
        // Only process group chat events
        switch (chatEvent.chat) {
            case (#Group(_)) {};
            case _ return;
        };

        // We are only interested in member joined events
        let event = switch (chatEvent.event) {
            case (#ParticipantJoined(e)) e;
            case _ return;
        };

        let ?welcomeMessage = state.messages.get(chatEvent.chat) else {
            return;
        };

        await sendWelcomeMessage(event.user_id, welcomeMessage, chatEvent.chat, apiGateway);
    };

    func handleCommunityEvent(communityEvent : BotEvents.BotCommunityEvent, apiGateway: B.CanisterId, state : State.State) : async () {
        // We are only interested in member joined events
        let event = switch (communityEvent.event) {
            case (#MemberJoined(e)) e;
            case _ return;
        };

        let ?(channelId, welcomeMessage) = state.messages.getForCommunity(communityEvent.community_id) else {
            return;
        };

        let chat = #Channel(communityEvent.community_id, Option.get(event.channel_id, channelId));

        await sendWelcomeMessage(event.user_id, welcomeMessage, chat, apiGateway);
    };

    func sendWelcomeMessage(userId : B.UserId, message : Text, chat : Chat.Chat, apiGateway: B.CanisterId) : async () {
        let client = Client.OpenChatClient({
            apiGateway = apiGateway;
            scope = #Chat(chat);
            jwt = null;
            messageId = null;
            thread = null;
        });

        let welcomeMessage = Text.replace(message, #text "{USERNAME}", "@UserId(" # Principal.toText(userId) # ")");

        ignore await client
            .sendTextMessage(welcomeMessage)
            .execute();
    };
};