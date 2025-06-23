use oc_bots_sdk::types::{Chat, CommunityId};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Default)]
pub struct WelcomeMessages {
    chats: HashMap<Chat, String>,
}

impl WelcomeMessages {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, chat: &Chat) -> Option<&String> {
        self.chats.get(chat)
    }

    pub fn set(&mut self, chat: Chat, message: String) -> bool {
        self.chats.insert(chat, message).is_some()
    }

    pub fn remove(&mut self, chat: &Chat) -> bool {
        self.chats.remove(chat).is_some()
    }

    pub fn remove_community(&mut self, community_id: CommunityId) {
        self.chats
            .retain(|chat, _| chat.community_id() != Some(community_id));
    }
}
