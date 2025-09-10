import Array "mo:base/Array";
import Debug "mo:base/Debug";
import Set "mo:base/TrieSet";
import Text "mo:base/Text";
import Ecdsa "mo:ecdsa";
import Regex "mo:regex";
import B "mo:openchat-bot-sdk/api/common/base";
import Chat "mo:openchat-bot-sdk/api/common/chat";
import Client "mo:openchat-bot-sdk/client";
import Sdk "mo:openchat-bot-sdk";
import ResponseBuilder "mo:openchat-bot-sdk/http/responseBuilder";
import BotEvents "mo:openchat-bot-sdk/api/common/botEvents";
import ChatEvents "mo:openchat-bot-sdk/api/common/chatEvents";
import MessageContent "mo:openchat-bot-sdk/api/common/messageContent";
import Permissions "mo:openchat-bot-sdk/api/common/permissions";
import State "state";

module {
    type Permissions = Permissions.Permissions;

    public func handler(state : State.State, ocPublicKey : Ecdsa.PublicKey) : Sdk.Http.UpdateHandler {
        func (request : Sdk.Http.Request) : async Sdk.Http.Response {
            let eventWrapper = switch (BotEvents.parseRequest(request, ocPublicKey)) {
                case (#ok(eventWrapper)) eventWrapper;
                case (#err(e)) {
                    Debug.print(e);
                    return ResponseBuilder.badRequest("Cannot candid decode event: " # e);
                };
            };

            switch (eventWrapper.event) {
                case (#Lifecycle lifecycleEvent) {
                    switch (lifecycleEvent) {
                        case (#Registered event) {
                            state.botId := ?event.bot_id;
                        };
                        case (#Installed event) {
                            state.installationRegistry.insert(event.location, {
                                apiGateway = eventWrapper.api_gateway;
                                grantedCommandPermissions = Permissions.fromRaw(event.granted_command_permissions);
                                grantedAutonomousPermissions = Permissions.fromRaw(event.granted_autonomous_permissions);
                            });
                        };
                        case (#Uninstalled event) {
                            state.installationRegistry.remove(event.location);
                        };
                    };
                };
                case (#Chat chatEvent) {
                    // Ignore chat events initiated by the bot itself
                    if (ChatEvents.initiatedBy(chatEvent.event) != state.botId) {
                        await handleChatEvent(chatEvent, eventWrapper.api_gateway, state);
                    };
                };
                case _ {};
            };

            return ResponseBuilder.success();
        };
    };

    func handleChatEvent(chatEvent : BotEvents.BotChatEvent, apiGateway : B.CanisterId, state : State.State) : async () {
        // Ignore events that are not messages
        let message = switch (chatEvent.event) {
            case (#Message message) message;
            case _ return;
        };

        // Ignore messages that don't have text content
        let ?text = MessageContent.text(message.content) else {
            return;
        };

        // Lookup the installation corresponding to this chat to see if 
        // the bot has the required permissions to delete and send messages
        let location = Chat.toLocation(chatEvent.chat);

        let ?installation = state.installationRegistry.get(location) else {
            Debug.print("Not installed in this chat: " # debug_show(chatEvent.chat));
            return;          
        };
        
        let required : Permissions = {
            community = [];
            chat = [#DeleteMessages];
            message = [#Text];
        };

        if (not Permissions.isSubset(required, installation.grantedAutonomousPermissions)) {
            Debug.print("Not permitted to delete and send messages");
            return;
        };

        // Split the message text into words
        let #ok words = Regex.Regex("\\W", null) |> _.split(text, null) else {
            return;
        };

        // Check if any of the words are in the banned words set
        let hasNoBannedWords = Array.map(words, Text.toLowercase) 
            |> Set.fromArray(_, Text.hash, Text.equal) 
            |> Set.intersect(_, state.bannedWordsLower, Text.equal)
            |> Set.isEmpty(_);

        if (hasNoBannedWords) {
            return;
        };

        let client = Client.OpenChatClient({
            apiGateway;
            scope = #Chat(chatEvent.chat);
            jwt = null;
            messageId = null;
            thread = null;
        });

        let sendResult = await client
            .sendTextMessage("Stop using bad language!")
            .inThread(chatEvent.thread)
            .inReplyTo(chatEvent.event_index)
            .execute();

        switch sendResult {
            case (#ok(#Success _)) {
                // TODO: Make a note of the reported message in the state
            };
            case other {
                Debug.print("Failed to reply to message: " # debug_show(other));
            };
        };

        let deleteResult = await client
            .deleteMessages([message.message_id])
            .inThread(chatEvent.thread)
            .execute();

        switch deleteResult {
            case (#ok(#Success _)) {
                // TODO: Make a note of the deleted message in the state
            };
            case other {
                Debug.print("Failed to delete message: " # debug_show(other));
            };
        };
    };
};