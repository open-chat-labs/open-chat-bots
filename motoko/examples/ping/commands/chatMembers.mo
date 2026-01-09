import Array "mo:base/Array";
import Option "mo:base/Option";
import Text "mo:base/Text";
import Sdk "mo:openchat-bot-sdk";
import B "mo:openchat-bot-sdk/api/common/base";
import Chat "mo:openchat-bot-sdk/api/common/chat";
import CommandScope "mo:openchat-bot-sdk/api/common/commandScope";
import CommandResponse "mo:openchat-bot-sdk/api/bot/commandResponse";
import MemberType "mo:openchat-bot-sdk/api/common/memberType";
import Utils "../utils";

module {
    type MemberType = MemberType.MemberType;

    public func build() : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute;
        };
    };

    func execute(client : Sdk.OpenChat.Client, context : Sdk.Command.Context) : async Sdk.Command.Result {
        let ?chatDetails = CommandScope.chatDetails(context.scope) else return #err "Expected Chat scope";
        let ?memberType = Sdk.Command.Arg.text(context.command, "type") |> MemberType.fromText(_) else return #err "Invalid member type";
        let channelId = Chat.channelId(chatDetails.chat);

        let response = await client   
            .members([memberType])
            .inChannel(channelId)
            .execute();

        let result = switch (response) {
            case (#ok(#Success res)) res;
            case (#ok(other)) return #err("Error calling bot_members: " # debug_show(other));
            case (#err(_, text)) return #err("C2C error calling bot_members: " # text);
        };

        // Find the array of user ids in the result with the specified member type
        let text = Array.find(result.members_map, func((mt : MemberType, _ : [B.UserId])) : Bool = mt == memberType)
            |> Option.map(_, func((_ : MemberType, userIds : [B.UserId])) : [B.UserId] = userIds)
            |> Utils.userIdsToText(_);

        let message = CommandResponse.EphemeralMessageBuilder(#Text { text }, chatDetails.message_id).build();

        return #ok { message = ?message };
    };

    func definition() : Sdk.Definition.Command {
        {
            name = "chat_members";
            description = ?"Lists the members of the group or channel";
            placeholder = ?"Please wait";
            params = [{
                name = "type";
                description = ?"The type of member to list";
                placeholder = ?"Choose the type of member e.g. Admin";
                required = true;
                param_type = #StringParam {
                    min_length = 1;
                    max_length = 1000;
                    multi_line = false;
                    choices = MemberType.toArray() 
                        |> Array.map(_, MemberType.toText) 
                        |> Array.map(_, func(text : Text) : Sdk.Definition.CommandOptionChoice<Text> = { name = text; value = text; });
                };
            }];
            permissions = {
                community = [];
                chat = [#ReadMembership];
                message = [];
            };
            default_role = null;
            direct_messages = null;
        };
    };
};
