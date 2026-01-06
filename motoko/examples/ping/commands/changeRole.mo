import Array "mo:base/Array";
import Sdk "mo:openchat-bot-sdk";
import ChatRole "mo:openchat-bot-sdk/api/common/chatRole";
import CommandScope "mo:openchat-bot-sdk/api/common/commandScope";
import CommandResponse "mo:openchat-bot-sdk/api/bot/commandResponse";

module {
    public func build() : Sdk.Command.Handler {
        {
            definition = definition();
            execute = execute;
        };
    };

    func execute(client : Sdk.OpenChat.Client, context : Sdk.Command.Context) : async Sdk.Command.Result {
        let ?chatDetails = CommandScope.chatDetails(context.scope) else return #err "Expected Chat scope";

        switch (chatDetails.chat) {
            case (#Direct(_)) return #err "Can't be used in a direct chat";
            case _ {};
        };

        let userId = Sdk.Command.Arg.user(context.command, "User");
        let roleText = Sdk.Command.Arg.text(context.command, "New role");
        let ?newRole = roleText |> ChatRole.fromText(_) else return #err "Invalid chat role";

        let response = await client   
            .changeRole([userId], newRole)
            .execute();

        let text = switch (response) {
            case (#ok(#Success)) "Role changed to " # roleText;
            case (other) return #err("Error calling change_role: " # debug_show(other));
        };

        let message = CommandResponse.EphemeralMessageBuilder(#Text { text }, chatDetails.message_id).build();

        return #ok { message = ?message };
    };

    func definition() : Sdk.Definition.Command {
        let roles = ["Owner", "Admin", "Moderator", "Member"];
        {
            name = "change_role";
            description = ?"Change the role of the given chat member";
            placeholder = null;
            params = [
                {
                    name = "User";
                    description = ?"The member whose role is being changed";
                    placeholder = null;
                    required = true;
                    param_type = #UserParam;
                },
                {
                    name = "New role";
                    description = ?"The new role";
                    placeholder = null;
                    required = true;
                    param_type = #StringParam {
                        min_length = 5;
                        max_length = 16;
                        multi_line = false;
                        choices = roles |> Array.map(_, func(value) = { name = value; value; });
                    };
                }
            ];
            permissions = {
                community = [];
                chat = [#ChangeRoles];
                message = [];
            };
            default_role = ?#Admin;
            direct_messages = null;
        };
    };
};
