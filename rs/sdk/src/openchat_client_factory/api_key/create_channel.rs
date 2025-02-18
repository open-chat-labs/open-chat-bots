use crate::{
    api::create_channel,
    types::{AccessGateConfig, CallResult, Document, GroupPermissions, Milliseconds, Rules},
    Runtime,
};

use super::OpenChatClientForApiKey;

pub struct CreateChannelBuilder<R> {
    client: OpenChatClientForApiKey<R>,
    name: String,
    is_public: bool,
    description: String,
    rules: Rules,
    avatar: Option<Document>,
    history_visible_to_new_joiners: bool,
    messages_visible_to_non_members: bool,
    permissions: Option<GroupPermissions>,
    events_ttl: Option<Milliseconds>,
    gate_config: Option<AccessGateConfig>,
    external_url: Option<String>,
}

impl<R: Runtime> CreateChannelBuilder<R> {
    pub fn new(client: OpenChatClientForApiKey<R>, name: String, is_public: bool) -> Self {
        CreateChannelBuilder {
            client,
            name,
            is_public,
            description: "".to_string(),
            rules: Rules::default(),
            avatar: None,
            history_visible_to_new_joiners: true,
            messages_visible_to_non_members: is_public,
            permissions: None, // Default permissions
            events_ttl: None,  // Disappearing messages disabled
            gate_config: None,
            external_url: None,
        }
    }

    pub fn with_description(mut self, description: String) -> Self {
        self.description = description;
        self
    }

    pub fn with_rules(mut self, rules: Rules) -> Self {
        self.rules = rules;
        self
    }

    pub fn with_avatar(mut self, avatar: Document) -> Self {
        self.avatar = Some(avatar);
        self
    }

    pub fn with_history_visible_to_new_joiners(
        mut self,
        history_visible_to_new_joiners: bool,
    ) -> Self {
        self.history_visible_to_new_joiners = history_visible_to_new_joiners;
        self
    }

    pub fn with_messages_visible_to_non_members(
        mut self,
        messages_visible_to_non_members: bool,
    ) -> Self {
        self.messages_visible_to_non_members = messages_visible_to_non_members;
        self
    }

    pub fn with_permissions(mut self, permissions: GroupPermissions) -> Self {
        self.permissions = Some(permissions);
        self
    }

    pub fn with_disappearing_messges(mut self, events_ttl: Milliseconds) -> Self {
        self.events_ttl = Some(events_ttl);
        self
    }

    pub fn with_access_gate(mut self, gate_config: AccessGateConfig) -> Self {
        self.gate_config = Some(gate_config);
        self
    }

    pub fn with_external_url(mut self, external_url: String) -> Self {
        self.external_url = Some(external_url);
        self
    }

    pub fn execute<
        F: FnOnce(create_channel::Args, CallResult<create_channel::Response>) + Send + Sync + 'static,
    >(
        self,
        on_response: F,
    ) {
        let runtime = self.client.runtime.clone();
        let runtime_clone = self.client.runtime.clone();
        let bot_api_gateway = self.client.context.api_gateway;
        let args = self.into_args();

        runtime.spawn(async move {
            let response = runtime_clone
                .create_channel(bot_api_gateway, args.clone())
                .await
                .map(|(r,)| r);

            on_response(args, response);
        });
    }

    pub async fn execute_async(self) -> CallResult<create_channel::Response> {
        let runtime = self.client.runtime.clone();
        let bot_api_gateway = self.client.context.api_gateway;
        let args = self.into_args();

        runtime
            .create_channel(bot_api_gateway, args)
            .await
            .map(|(r,)| r)
    }

    fn into_args(self) -> create_channel::Args {
        create_channel::Args {
            auth_token: self.client.context.token,
            name: self.name,
            is_public: self.is_public,
            description: self.description,
            rules: self.rules,
            avatar: self.avatar,
            history_visible_to_new_joiners: self.history_visible_to_new_joiners,
            messages_visible_to_non_members: self.messages_visible_to_non_members,
            permissions: self.permissions,
            events_ttl: self.events_ttl,
            gate_config: self.gate_config,
            external_url: self.external_url,
        }
    }
}
