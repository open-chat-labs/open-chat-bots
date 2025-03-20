use crate::state::{mutate, State};
use ::cron::Schedule;
use chrono::DateTime;
use chrono_tz::Tz;
use english_to_cron::str_cron_syntax;
use ic_cdk_timers::TimerId;
use oc_bots_sdk::oc_api::actions::{send_message, ActionArgsBuilder};
use oc_bots_sdk::types::{
    ActionScope, BotApiKeyContext, BotPermissions, Chat, MessageContentInitial, TextContent,
    TimestampMillis, UserId,
};
use oc_bots_sdk_canister::{env, OPENCHAT_CLIENT_FACTORY};
use serde::{Deserialize, Serialize};
use std::cell::Cell;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::str::FromStr;
use std::time::Duration;
use truncrate::*;

const MAX_REMINDERS: usize = 100_000;
const MAX_REMINDERS_PER_CHAT: usize = 100;

thread_local! {
    static TIMER_ID: Cell<Option<TimerId>> = Cell::default();
}

pub(crate) fn start_job_if_required(state: &mut State) -> bool {
    if TIMER_ID.get().is_none() {
        if let Some(next_reminder_due) = state.reminders.peek().map(|(timestamp, _)| timestamp) {
            let utc_now = env::now();
            let timer_id = ic_cdk_timers::set_timer(
                Duration::from_millis(next_reminder_due.saturating_sub(utc_now)),
                run,
            );
            TIMER_ID.set(Some(timer_id));
            return true;
        }
    }

    false
}

pub(crate) fn restart_job(state: &mut State) {
    if let Some(timer_id) = TIMER_ID.get() {
        ic_cdk_timers::clear_timer(timer_id);
        TIMER_ID.set(None);
    }

    start_job_if_required(state);
}

fn run() {
    TIMER_ID.set(None);

    mutate(|state| {
        while let Some(reminder) = state.reminders.pop_next_due_reminder(env::now()) {
            if let Some(api_key) = state.api_key_registry.get_key_with_required_permissions(
                &ActionScope::Chat(reminder.chat),
                &BotPermissions::text_only(),
            ) {
                ic_cdk::spawn(send_reminder(
                    api_key.to_context(),
                    reminder.message.clone(),
                    reminder.chat,
                    reminder.chat_reminder_id,
                ));
            } else {
                continue;
            }
        }

        start_job_if_required(state);
    });
}

async fn send_reminder(context: BotApiKeyContext, text: String, chat: Chat, chat_reminder_id: u8) {
    match OPENCHAT_CLIENT_FACTORY
        .build(context)
        .send_message(MessageContentInitial::Text(TextContent { text }))
        .with_block_level_markdown(true)
        .execute_async()
        .await
    {
        Ok(send_message::Response::Success(_)) => (),
        Err((code, message)) => {
            ic_cdk::println!("Failed to send reminder: {}: {}", code, message);
        }
        other => {
            mutate(|state| {
                let _ = state.reminders.delete(&chat, chat_reminder_id);
            });
            ic_cdk::println!("Failed to send reminder - DELETING: {:?}", other);
        }
    }
}

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
    when: RemindWhen,
    timezone: Tz,
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

        let when = match &self.when {
            RemindWhen::Recurring(text) => format!("recurs {}", text),
            RemindWhen::Once(ts) => Self::format_datetime(*ts, &self.timezone).to_string(),
        };

        format!("#{} \"{}\" {}", self.chat_reminder_id, message, when)
    }

    pub fn format_datetime(ts: TimestampMillis, tz: &Tz) -> String {
        let next = DateTime::from_timestamp_millis(ts as i64)
            .unwrap()
            .with_timezone(tz);

        next.format("at %H:%M on %a, %d %b %Y").to_string()
    }
}

impl Reminders {
    pub fn add(
        &mut self,
        message: String,
        when: RemindWhen,
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
            self.per_chat.insert(chat, BTreeMap::new());
        }

        let (timestamp, schedule) = match &when {
            RemindWhen::Recurring(text) => {
                // Parse the CRON schedule
                let cron = str_cron_syntax(text)
                    .map_err(|_| "I don't understand when you want to be reminded".to_string())?;

                // Create a schedule from the CRON string
                let schedule = Schedule::from_str(&cron)
                    .map_err(|error| format!("Incompatible CRON schedule: {error:?}"))?;

                // Calculate the next reminder time
                let timestamp = Self::next_reminder_time(&schedule, utc_now, &timezone, true)?;

                (timestamp, Some(schedule))
            }
            RemindWhen::Once(ts) => (*ts, None),
        };

        // Determine the next global ID and chat ID
        let global_id = self.next_id;
        self.next_id += 1;
        let chat_reminder_id = self.get_next_available_chat_id(&chat);

        // Insert the reminder ID into the per-chat map
        self.per_chat
            .get_mut(&chat)
            .unwrap()
            .insert(chat_reminder_id, global_id);

        // Insert the reminder into the global map
        self.reminders.insert(
            global_id,
            Reminder {
                chat_reminder_id,
                message,
                when,
                timezone,
                schedule,
                initiator,
                chat,
            },
        );

        // Insert the reminder into the ordered set
        self.ordered.insert((timestamp, global_id));

        // Check if this reminder is actually the next due reminder
        let next_due = self.peek().map(|(_, id)| id == global_id).unwrap();

        Ok(AddResult {
            chat_reminder_id,
            timestamp,
            timezone,
            next_due,
        })
    }

    pub fn peek(&self) -> Option<(TimestampMillis, u64)> {
        self.ordered.iter().next().copied()
    }

    pub fn pop_next_due_reminder(&mut self, utc_now: TimestampMillis) -> Option<Reminder> {
        let (timestamp, global_id) = self.peek()?;

        if timestamp > utc_now {
            // The next reminder is not due yet
            return None;
        }

        self.ordered.pop_first();

        let reminder = self.reminders.get_mut(&global_id)?;

        // Find the next reminder time if there is one
        let (reminder, repeating) = if let Some(next) =
            reminder.schedule.as_ref().and_then(|schedule| {
                Self::next_reminder_time(schedule, utc_now, &reminder.timezone, false).ok()
            }) {
            // This is a repeating reminder so insert the next occurrence
            self.ordered.insert((next, global_id));

            (reminder.clone(), true)
        } else {
            // This is a one-off reminder so delete it
            (self.reminders.remove(&global_id).unwrap(), false)
        };

        if !repeating {
            match self.delete_from_chat(&reminder.chat, reminder.chat_reminder_id) {
                Ok(_) => (),
                Err(error) => {
                    ic_cdk::println!(
                        "Failed to delete reminder from chat: {} {}",
                        reminder.chat.canister_id().to_string(),
                        error
                    );
                }
            }
        }

        Some(reminder)
    }

    pub fn delete(&mut self, chat: &Chat, chat_reminder_id: u8) -> Result<Reminder, String> {
        let global_id = self.delete_from_chat(chat, chat_reminder_id)?;

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

    fn delete_from_chat(&mut self, chat: &Chat, chat_reminder_id: u8) -> Result<u64, String> {
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

        Ok(global_id)
    }

    fn next_reminder_time(
        schedule: &Schedule,
        utc_now: TimestampMillis,
        timezone: &Tz,
        check_frequency: bool,
    ) -> Result<TimestampMillis, String> {
        // Convert the current time to the initiator's timezone
        let local_now = DateTime::from_timestamp_millis(utc_now as i64)
            .unwrap()
            .with_timezone(timezone);

        // Get the next scheduled time
        let mut schedule_iter = schedule.after(&local_now);
        let first = schedule_iter
            .next()
            .map(|dt| dt.timestamp_millis() as u64)
            .ok_or("No upcoming schedule found".to_string())?;

        // Return error if the reminder happens too often (less than 10 minutes apart)
        if check_frequency {
            if let Some(next) = schedule_iter.next() {
                if next.timestamp_millis() as u64 - first < 10 * 60 * 1000 {
                    return Err("The reminder is too frequent".to_string());
                }
            }
        }

        Ok(first)
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
}

pub struct AddResult {
    pub chat_reminder_id: u8,
    pub timestamp: TimestampMillis,
    pub timezone: Tz,
    pub next_due: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub enum RemindWhen {
    Recurring(String),
    Once(TimestampMillis),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_formatting() {
        let tz_str = "Europe/London";
        let timezone: Tz = tz_str.parse().unwrap();
        let timestamp: TimestampMillis = 1741608144000;

        assert_eq!(
            Reminder::format_datetime(timestamp, &timezone),
            "at 12:02 on Mon, 10 Mar 2025"
        );
    }
}
