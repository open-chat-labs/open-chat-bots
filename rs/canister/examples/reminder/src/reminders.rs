use ::cron::Schedule;
use chrono::DateTime;
use english_to_cron::str_cron_syntax;
use oc_bots_sdk::types::{Chat, TimestampMillis, UserId};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::str::FromStr;
use truncrate::*;

const MAX_REMINDERS: usize = 100_000;
const MAX_REMINDERS_PER_CHAT: usize = 100;

#[derive(Serialize, Deserialize, Default)]
pub struct Reminders {
    reminders: HashMap<u64, Reminder>,
    per_chat: HashMap<Chat, BTreeMap<u8, u64>>,
    ordered: BTreeSet<(TimestampMillis, u64)>,
    next_id: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Reminder {
    chat_reminder_id: u8,
    message: String,
    when: String,
    schedule: Schedule,
    initiator: UserId,
    chat: Chat,
}

impl Reminder {
    pub fn to_text(&self) -> String {
        format!(
            "{}: {} -> {}",
            self.chat_reminder_id,
            self.when,
            self.message.truncate_to_boundary(50),
        )
    }
}

impl Reminders {
    pub fn add(
        &mut self,
        message: String,
        when: String,
        initiator: UserId,
        chat: Chat,
        now: TimestampMillis,
    ) -> Result<AddResult, String> {
        // Check max global reminders
        if self.reminders.len() >= MAX_REMINDERS {
            return Err("Too many reminders".to_string());
        }

        // Check max reminders per chat and initialize the per-chat map if needed
        if let Some(per_chat) = self.per_chat.get(&chat) {
            if per_chat.len() >= MAX_REMINDERS_PER_CHAT {
                return Err("Too many reminders in this chat".to_string());
            }
        } else {
            self.per_chat.insert(chat.clone(), BTreeMap::new());
        }

        // Parse the CRON schedule
        let cron = str_cron_syntax(&when).map_err(|error| {
            format!("Cannot understand when this reminder should be scheduled: {error:?}")
        })?;

        // Create a schedule from the CRON string
        let schedule = Schedule::from_str(&cron)
            .map_err(|error| format!("Incompatible CRON schedule: {error:?}"))?;

        // Get the next scheduled time
        let now = DateTime::from_timestamp_millis(now as i64).unwrap();
        let mut schedule_iter = schedule.after(&now);
        let Some(next) = schedule_iter.next().map(|dt| dt.timestamp() as u64) else {
            return Err("No upcoming schedule found".to_string());
        };

        // Check if the schedule repeats
        let repeats = schedule_iter.next().is_some();

        // TODO: Return error if the reminder happens too often

        // Determine the next global ID and chat ID
        let id = self.next_id;
        self.next_id += 1;
        let chat_reminder_id = self.get_next_available_chat_id(&chat);

        // Insert the reminder ID into the per-chat map
        self.per_chat
            .get_mut(&chat)
            .unwrap()
            .insert(chat_reminder_id, id);

        // Insert the reminder into the global map
        self.reminders.insert(
            id,
            Reminder {
                chat_reminder_id,
                message,
                when,
                schedule,
                initiator,
                chat,
            },
        );

        // Insert the reminder into the ordered set
        self.ordered.insert((next, id));

        Ok(AddResult {
            chat_reminder_id,
            next_schedule: next,
            repeats,
        })
    }

    // We assume that there is an entry for the given chat and that
    // the per_chat map has at least one space left
    fn get_next_available_chat_id(&self, chat: &Chat) -> u8 {
        let per_chat = self.per_chat.get(chat).unwrap();
        for i in 0..MAX_REMINDERS_PER_CHAT as u8 {
            if !per_chat.contains_key(&i) {
                return i;
            }
        }
        unreachable!()
    }

    pub fn delete(&mut self, chat: &Chat, chat_reminder_id: u8) -> Result<Reminder, String> {
        let chat_reminders = self
            .per_chat
            .get_mut(chat)
            .ok_or("Chat not found".to_string())?;

        let global_id = chat_reminders
            .remove(&chat_reminder_id)
            .ok_or("Reminder not found".to_string())?;

        // Don't bother removing from the ordered set - when the reminder is due, it will be removed

        self.reminders
            .remove(&global_id)
            .ok_or("Reminder not found".to_string())
    }

    pub fn list(&self, chat: &Chat) -> Vec<Reminder> {
        self.per_chat
            .get(chat)
            .map(|chat_reminders| {
                chat_reminders
                    .iter()
                    .filter_map(|(_, global_id)| self.reminders.get(global_id))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn count(&self) -> usize {
        self.reminders.len()
    }

    pub fn chats_count(&self) -> usize {
        self.per_chat.len()
    }
}

pub struct AddResult {
    pub chat_reminder_id: u8,
    pub next_schedule: TimestampMillis,
    pub repeats: bool,
}
