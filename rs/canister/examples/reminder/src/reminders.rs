use ::cron::Schedule;
use chrono::DateTime;
use chrono_tz::Tz;
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
    schedule: Option<Schedule>,
    initiator: UserId,
    chat: Chat,
}

impl Reminder {
    pub fn to_text(&self) -> String {
        let mut message = self.message.trim().replace(['\n'], " ");

        if message.len() > 55 {
            message = format!("{}...", message.truncate_to_boundary(50));
        }

        format!(
            "#{} {} -> {}{}",
            self.chat_reminder_id,
            self.when,
            message,
            if self.schedule.is_some() {
                " [repeats]"
            } else {
                ""
            },
        )
    }
}

impl Reminders {
    #[allow(clippy::too_many_arguments)]
    pub fn add(
        &mut self,
        message: String,
        when: String,
        repeat: bool,
        timezone: &str,
        initiator: UserId,
        chat: Chat,
        utc_now: TimestampMillis,
    ) -> Result<AddResult, String> {
        // Parse the initiator's local IANA timezone e.g. "Europe/London"
        let timezone: Tz = timezone
            .parse()
            .map_err(|error| format!("Cannot parse timezone: {error:?}"))?;

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
        let cron = str_cron_syntax(&when)
            .map_err(|_| "I don't understand when you want to be reminded".to_string())?;

        // Create a schedule from the CRON string
        let schedule = Schedule::from_str(&cron)
            .map_err(|error| format!("Incompatible CRON schedule: {error:?}"))?;

        // Convert the current time to the initiator's timezone
        let local_now = DateTime::from_timestamp_millis(utc_now as i64)
            .unwrap()
            .with_timezone(&timezone);

        // Get the next scheduled time
        let mut schedule_iter = schedule.after(&local_now);
        let Some(first) = schedule_iter.next().map(|dt| dt.timestamp_millis() as u64) else {
            return Err("No upcoming schedule found".to_string());
        };

        // Return error if the reminder happens too often (less than 10 minutes apart)
        if repeat {
            if let Some(next) = schedule_iter.next() {
                if next.timestamp_millis() as u64 - first < 10 * 60 * 1000 {
                    return Err("The reminder is too frequent".to_string());
                }
            }
        }

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
                schedule: repeat.then_some(schedule),
                initiator,
                chat,
            },
        );

        // Insert the reminder into the ordered set
        self.ordered.insert((first, id));

        Ok(AddResult {
            chat_reminder_id,
            timestamp: first,
        })
    }

    // We assume that there is an entry for the given chat and that
    // the per_chat map has at least one space left
    fn get_next_available_chat_id(&self, chat: &Chat) -> u8 {
        let per_chat = self.per_chat.get(chat).unwrap();
        for i in 1..(MAX_REMINDERS_PER_CHAT + 1) as u8 {
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

        if chat_reminders.is_empty() {
            self.per_chat.remove(chat);
        }

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
    pub timestamp: TimestampMillis,
}
