use super::Client;
use crate::oc_api::actions::create_channel::*;
use crate::oc_api::actions::ActionArgsBuilder;
use crate::oc_api::Runtime;
use crate::types::{
    AccessGateConfig, ActionContext, CanisterId, ChatPermissions, Document, Milliseconds, Rules,
};
use std::sync::Arc;

pub struct CreateChannelBuilder<'c, R, C> {
    client: &'c Client<R, C>,
    name: String,
    is_public: bool,
    description: String,
    rules: Rules,
    avatar: Option<Document>,
    history_visible_to_new_joiners: bool,
    messages_visible_to_non_members: bool,
    permissions: Option<ChatPermissions>,
    events_ttl: Option<Milliseconds>,
    gate_config: Option<AccessGateConfig>,
    external_url: Option<String>,
}

impl<'c, R: Runtime, C: ActionContext> CreateChannelBuilder<'c, R, C> {
    pub fn new(client: &'c Client<R, C>, name: String, is_public: bool) -> Self {
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

    pub fn with_permissions(mut self, permissions: ChatPermissions) -> Self {
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
}

impl<R: Runtime, C: ActionContext> ActionArgsBuilder<R> for CreateChannelBuilder<'_, R, C> {
    type Action = CreateChannelAction;

    fn runtime(&self) -> Arc<R> {
        self.client.runtime.clone()
    }

    fn api_gateway(&self) -> CanisterId {
        self.client.context.api_gateway()
    }

    fn into_args(self) -> Args {
        Args {
            auth_token: self.client.context.auth_token().clone(),
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
