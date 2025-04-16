import Error "mo:base/Error";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

import ActionContext "../api/bot/actionContext";
import A "../api/common/accessGates";
import B "../api/common/base";
import P "../api/common/chatPermissions";
import CreateChannel "../api/oc/createChannel";

module {
    public class Builder(context : ActionContext.ActionContext, name : Text, isPublic : Bool) = this {
        var description = "";
        var rules : B.Rules = { text = ""; enabled = false; };
        var avatar : ?B.Document = null;
        var historyVisibleToNewJoiners = false;
        var messagesVisibleToNonMembers = false;
        var permissions : ?P.ChatPermissions = null;
        var eventsTtl : ?B.Milliseconds = null;
        var gateConfig : ?A.AccessGateConfig = null;
        var externalUrl : ?Text = null;

        public func withDescription(value: Text)  : Builder {
            description := value;
            this;
        };

        public func withRules(value: B.Rules)  : Builder {
            rules := value;
            this;
        };

        public func withAvatar(value: B.Document)  : Builder {
            avatar := ?value;
            this;
        };

        public func withHistoryVisibleToNewJoiners(value: Bool)  : Builder {
            historyVisibleToNewJoiners := value;
            this;
        };

        public func withMessagesVisibleToNonMembers(value: Bool)  : Builder {
            messagesVisibleToNonMembers := value;
            this;
        };

        public func withPermissions(value: P.ChatPermissions)  : Builder {
            permissions := ?value;
            this;
        };

        public func with_disappearing_messges(value: B.Milliseconds)  : Builder {
            eventsTtl := ?value;
            this;
        };

        public func with_access_gate(value: A.AccessGateConfig)  : Builder {
            gateConfig := ?value;
            this;
        };

        public func with_external_url(value: Text)  : Builder {
            externalUrl := ?value;
            this;
        };

        public func execute() : async Result.Result<CreateChannel.Response, (Error.ErrorCode, Text)> {
            let botApiActor = actor (Principal.toText(context.apiGateway)) : CreateChannel.Actor;

            try {
                let response = await botApiActor.bot_create_channel({
                    is_public = isPublic;
                    name = name;
                    description = description;
                    rules = rules;
                    avatar = avatar;    
                    history_visible_to_new_joiners = historyVisibleToNewJoiners;
                    messages_visible_to_non_members = messagesVisibleToNonMembers;
                    permissions = permissions;
                    events_ttl = eventsTtl;
                    gate_config = gateConfig;
                    external_url = externalUrl;
                    auth_token = context.authToken;
                });

                #ok response;
            } catch (error) {
                #err((Error.code(error), Error.message(error)));
            };
        };
    };
};