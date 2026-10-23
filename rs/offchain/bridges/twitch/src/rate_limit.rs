//! Paces what the bot sends to Twitch's chat limits. Twitch drops what's over them, and ignores the
//! bot for an hour, except where it's a moderator or VIP. The limits are the bot's across every
//! channel:
//! - 20 messages per 30 seconds, and 1 per second in each channel;
//! - up to 100 per 30 seconds in channels where it's a moderator or VIP. Those count towards the 20
//!   too, so while they fill them, it can only send where it's a moderator or VIP.

use oc_bridge_core::PermanentFailure;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use tokio::time::{Duration, Instant};

// With a little more than Twitch's 30 seconds, as Twitch counts from when each message arrives
const WINDOW: Duration = Duration::from_secs(32);
const LIMIT: usize = 20;
const PRIVILEGED_LIMIT: usize = 100;
const CHANNEL_INTERVAL: Duration = Duration::from_millis(1100);
// Live chat moves on, so a message which would wait longer to be sent is dropped
const MAX_WAIT: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct RateLimiter {
    state: Mutex<State>,
    // So each channel's messages are sent in the order they arrived
    channels: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
}

#[derive(Default)]
struct State {
    // When the bot sent each message within the window, in any channel
    sent: VecDeque<Instant>,
    last_sent: HashMap<String, Instant>,
    // The channels where the bot is a moderator or VIP, as far as the bridge knows
    privileged: HashMap<String, bool>,
}

impl RateLimiter {
    /// Waits until a message can be sent in the channel, and counts it as sent. Fails with a
    /// `PermanentFailure` if it would wait too long.
    pub async fn wait(&self, channel: &str) -> Result<(), PermanentFailure> {
        let deadline = Instant::now() + MAX_WAIT;
        let lock = self
            .channels
            .lock()
            .unwrap()
            .entry(channel.to_string())
            .or_default()
            .clone();
        let _turn = tokio::time::timeout_at(deadline, lock.lock())
            .await
            .map_err(|_| too_long())?;
        loop {
            let next = self.state.lock().unwrap().try_send(channel, Instant::now());
            match next {
                Ok(()) => return Ok(()),
                Err(at) if at > deadline => return Err(too_long()),
                Err(at) => tokio::time::sleep_until(at).await,
            }
        }
    }

    /// Whether the bot is a moderator or VIP in the channel, as its badges on its own messages
    /// there show
    pub fn set_privileged(&self, channel: &str, privileged: bool) {
        self.state
            .lock()
            .unwrap()
            .privileged
            .insert(channel.to_string(), privileged);
    }
}

fn too_long() -> PermanentFailure {
    PermanentFailure::Rejected("Twitch's rate limits would hold the message too long".to_string())
}

impl State {
    // Counts a message as sent in the channel now, if Twitch's limits allow it, or returns when to
    // try again
    fn try_send(&mut self, channel: &str, now: Instant) -> Result<(), Instant> {
        while self
            .sent
            .front()
            .is_some_and(|sent| now.duration_since(*sent) >= WINDOW)
        {
            self.sent.pop_front();
        }

        let privileged = self.privileged.get(channel).copied().unwrap_or_default();
        let limit = if privileged { PRIVILEGED_LIMIT } else { LIMIT };
        let mut retry_at = None;
        if self.sent.len() >= limit {
            // Once this one leaves the window, the limit has room again
            retry_at = Some(self.sent[self.sent.len() - limit] + WINDOW);
        }
        if !privileged
            && let Some(last) = self.last_sent.get(channel)
            && now < *last + CHANNEL_INTERVAL
        {
            retry_at = retry_at.max(Some(*last + CHANNEL_INTERVAL));
        }

        match retry_at {
            Some(at) => Err(at),
            None => {
                self.sent.push_back(now);
                self.last_sent.insert(channel.to_string(), now);
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn twenty_messages_per_window_across_every_channel() {
        let mut state = State::default();
        let start = Instant::now();
        for i in 0..20 {
            let channel = format!("{}", i % 4);
            let now = start + Duration::from_secs(i);
            assert_eq!(state.try_send(&channel, now), Ok(()));
        }
        // The first message has to leave the window first
        let now = start + Duration::from_secs(20);
        assert_eq!(state.try_send("5", now), Err(start + WINDOW));
        assert_eq!(state.try_send("5", start + WINDOW), Ok(()));
    }

    #[test]
    fn one_message_a_second_in_a_channel() {
        let mut state = State::default();
        let start = Instant::now();
        assert_eq!(state.try_send("1", start), Ok(()));
        assert_eq!(state.try_send("1", start), Err(start + CHANNEL_INTERVAL));
        // Another channel isn't held up
        assert_eq!(state.try_send("2", start), Ok(()));
        assert_eq!(state.try_send("1", start + CHANNEL_INTERVAL), Ok(()));
    }

    #[test]
    fn a_moderator_can_send_more_but_fills_the_shared_limit() {
        let mut state = State::default();
        state.privileged.insert("mod".to_string(), true);
        let start = Instant::now();
        for _ in 0..100 {
            assert_eq!(state.try_send("mod", start), Ok(()));
        }
        assert_eq!(state.try_send("mod", start), Err(start + WINDOW));
        // Elsewhere the bot has to wait until there are fewer than 20 in the window
        assert_eq!(state.try_send("other", start), Err(start + WINDOW));
    }

    #[tokio::test(start_paused = true)]
    async fn a_message_which_would_wait_too_long_is_dropped() {
        let limiter = Arc::new(RateLimiter::default());
        let waits: Vec<_> = (0..45)
            .map(|_| {
                let limiter = limiter.clone();
                tokio::spawn(async move { limiter.wait("1").await.is_ok() })
            })
            .collect();
        let mut sent = 0;
        for wait in waits {
            if wait.await.unwrap() {
                sent += 1;
            }
        }
        // 20 in the first window, then 20 more from when it has passed, 32 seconds in. The rest
        // would wait until over a minute in.
        assert_eq!(sent, 40);
    }
}
