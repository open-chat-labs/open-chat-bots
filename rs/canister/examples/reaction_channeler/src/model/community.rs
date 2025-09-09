use oc_bots_sdk::types::{ChannelId, Message, MessageId};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Default)]
pub struct Community {
    rules: HashMap<String, ChannelId>,
    messages_copied: HashMap<MessageId, Vec<ChannelId>>,
}

impl Community {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_rule(&mut self, emoji: String, channel_id: ChannelId) {
        self.rules.insert(emoji, channel_id);
    }

    pub fn delete_rule(&mut self, emoji: &str) {
        self.rules.remove(emoji);
    }

    pub fn get_rules(&self) -> &HashMap<String, ChannelId> {
        &self.rules
    }

    pub fn fork_message(&mut self, message: Message) -> Vec<ChannelId> {
        let mut channels = Vec::new();

        for (emoji, _) in &message.reactions {
            if let Some(&channel_id) = self.rules.get(emoji)
                && !self
                    .messages_copied
                    .get(&message.message_id)
                    .is_some_and(|chs| chs.contains(&channel_id))
            {
                channels.push(channel_id);
                self.messages_copied
                    .entry(message.message_id)
                    .or_default()
                    .push(channel_id);
            }
        }
        channels
    }
}
