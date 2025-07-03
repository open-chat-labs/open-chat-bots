use oc_bots_sdk::types::{ChannelId, Chat, CommunityId};
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

    pub fn get(&self, chat: &Chat) -> Option<String> {
        match chat {
            Chat::Channel(community_id, _) => self
                .get_for_community(*community_id)
                .map(|(_, message)| message),
            _ => self.chats.get(chat).cloned(),
        }
    }

    pub fn get_for_community(&self, id: CommunityId) -> Option<(ChannelId, String)> {
        self.chats.iter().find_map(|(chat, message)| match chat {
            Chat::Channel(community_id, channel_id) if community_id == &id => {
                Some((*channel_id, message.clone()))
            }
            _ => None,
        })
    }

    pub fn set(&mut self, chat: Chat, message: String) {
        // Remove any existing welcome messages from the same community
        if let Some(community_id) = chat.community_id() {
            self.chats
                .retain(|c, _| c.community_id() != Some(community_id));
        }

        self.chats.insert(chat, message);
    }

    pub fn remove(&mut self, chat: &Chat) -> bool {
        self.chats.remove(chat).is_some()
    }

    pub fn remove_community(&mut self, community_id: CommunityId) {
        self.chats
            .retain(|chat, _| chat.community_id() != Some(community_id));
    }

    pub fn len(&self) -> usize {
        self.chats.len()
    }
}
