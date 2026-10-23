//! Paces what the bot sends to Twitch's chat limits. Twitch drops what's over them, and ignores the
//! bot for an hour, except where it's a moderator or VIP. The limits are the bot's across every
//! channel:
//! - 20 messages per 30 seconds, and 1 per second in each channel;
//! - up to 100 per 30 seconds in channels where it's a moderator or VIP. Those count towards the 20
//!   too, so while they fill them, it can only send where it's a moderator or VIP.
//!
//! The bridge keeps to 1 per second in every channel, as it only learns the bot has stopped being a
//! moderator or VIP from its next message there, by when a faster burst would be over the limits.

use oc_bridge_core::PermanentFailure;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use tokio::sync::OwnedMutexGuard;
use tokio::time::{Duration, Instant};

// With a little more than Twitch's 30 seconds, to be safe
const WINDOW: Duration = Duration::from_secs(32);
const LIMIT: usize = 20;
const PRIVILEGED_LIMIT: usize = 100;
const CHANNEL_INTERVAL: Duration = Duration::from_millis(1100);
// How often a message waiting on another's send checks whether it can go
const POLL_INTERVAL: Duration = Duration::from_millis(100);
// Live chat moves on, so a message which would wait longer to be sent is dropped. It's well inside
// the 60 seconds OpenChat, or CloudFront before the bridge, waits for an answer.
const MAX_WAIT: Duration = Duration::from_secs(30);

#[derive(Default)]
pub struct RateLimiter {
    state: Arc<Mutex<State>>,
    // So each channel's messages are sent one at a time, in the order they arrived
    channels: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
}

#[derive(Default)]
struct State {
    // When each message the bot sent within the window was answered, in any channel
    sent: VecDeque<Instant>,
    // Messages being sent, which count until they're answered, and from when they are
    sending: usize,
    last_sent: HashMap<String, Instant>,
    // The channels where the bot is a moderator or VIP, as far as the bridge knows
    privileged: HashMap<String, bool>,
}

/// A message's turn to be sent in a channel. It's counted as sent when the turn is dropped, once
/// Twitch has answered, as Twitch counts from when each message arrives.
pub struct Turn {
    state: Arc<Mutex<State>>,
    channel: String,
    _channel_turn: OwnedMutexGuard<()>,
}

impl Drop for Turn {
    fn drop(&mut self) {
        self.state
            .lock()
            .unwrap()
            .finish_send(&self.channel, Instant::now());
    }
}

impl RateLimiter {
    /// Waits until a message can be sent in the channel, then returns its turn, which is held
    /// while it's sent. Fails with a `PermanentFailure` if it would wait too long.
    pub async fn turn(&self, channel: &str) -> Result<Turn, PermanentFailure> {
        let deadline = Instant::now() + MAX_WAIT;
        let lock = self
            .channels
            .lock()
            .unwrap()
            .entry(channel.to_string())
            .or_default()
            .clone();
        let channel_turn = tokio::time::timeout_at(deadline, lock.lock_owned())
            .await
            .map_err(|_| too_long())?;
        loop {
            let next = self
                .state
                .lock()
                .unwrap()
                .start_send(channel, Instant::now());
            match next {
                Ok(()) => {
                    return Ok(Turn {
                        state: self.state.clone(),
                        channel: channel.to_string(),
                        _channel_turn: channel_turn,
                    });
                }
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
    // Starts sending a message in the channel now, if Twitch's limits allow it, or returns when to
    // try again
    fn start_send(&mut self, channel: &str, now: Instant) -> Result<(), Instant> {
        while self
            .sent
            .front()
            .is_some_and(|sent| now.duration_since(*sent) >= WINDOW)
        {
            self.sent.pop_front();
        }

        let privileged = self.privileged.get(channel).copied().unwrap_or_default();
        let limit = if privileged { PRIVILEGED_LIMIT } else { LIMIT };
        let counted = self.sent.len() + self.sending;
        let mut retry_at = None;
        if counted >= limit {
            // Once this one leaves the window, the limit has room again. If it's one still being
            // sent, it isn't known when that will be.
            retry_at = Some(match self.sent.get(counted - limit) {
                Some(sent) => *sent + WINDOW,
                None => now + POLL_INTERVAL,
            });
        }
        if let Some(last) = self.last_sent.get(channel)
            && now < *last + CHANNEL_INTERVAL
        {
            retry_at = retry_at.max(Some(*last + CHANNEL_INTERVAL));
        }

        match retry_at {
            Some(at) => Err(at),
            None => {
                self.sending += 1;
                Ok(())
            }
        }
    }

    fn finish_send(&mut self, channel: &str, now: Instant) {
        self.sending -= 1;
        self.sent.push_back(now);
        self.last_sent.insert(channel.to_string(), now);
    }

    #[cfg(test)]
    fn send(&mut self, channel: &str, now: Instant) -> Result<(), Instant> {
        self.start_send(channel, now)?;
        self.finish_send(channel, now);
        Ok(())
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
            assert_eq!(state.send(&channel, now), Ok(()));
        }
        // The first message has to leave the window first
        let now = start + Duration::from_secs(20);
        assert_eq!(state.send("5", now), Err(start + WINDOW));
        assert_eq!(state.send("5", start + WINDOW), Ok(()));
    }

    #[test]
    fn one_message_a_second_in_a_channel() {
        let mut state = State::default();
        let start = Instant::now();
        assert_eq!(state.send("1", start), Ok(()));
        assert_eq!(state.send("1", start), Err(start + CHANNEL_INTERVAL));
        // Another channel isn't held up
        assert_eq!(state.send("2", start), Ok(()));
        assert_eq!(state.send("1", start + CHANNEL_INTERVAL), Ok(()));

        // Even where the bot's a moderator
        state.privileged.insert("mod".to_string(), true);
        assert_eq!(state.send("mod", start), Ok(()));
        assert_eq!(state.send("mod", start), Err(start + CHANNEL_INTERVAL));
    }

    #[test]
    fn a_moderator_can_send_more_but_fills_the_shared_limit() {
        let mut state = State::default();
        let start = Instant::now();
        for i in 0..100 {
            let channel = format!("mod{}", i % 10);
            state.privileged.insert(channel.clone(), true);
            let now = start + Duration::from_millis(i * 200);
            assert_eq!(state.send(&channel, now), Ok(()));
        }
        let now = start + Duration::from_secs(20);
        state.privileged.insert("mod11".to_string(), true);
        assert_eq!(state.send("mod11", now), Err(start + WINDOW));
        // Elsewhere the bot has to wait until there are fewer than 20 in the window
        assert_eq!(
            state.send("other", now),
            Err(start + Duration::from_millis(80 * 200) + WINDOW)
        );
    }

    #[test]
    fn a_message_being_sent_counts() {
        let mut state = State::default();
        let start = Instant::now();
        for i in 0..20 {
            assert_eq!(state.start_send(&i.to_string(), start), Ok(()));
        }
        // None has been answered, so it isn't known when they'll leave the window
        assert_eq!(state.send("a", start), Err(start + POLL_INTERVAL));
    }

    #[test]
    fn a_channels_interval_runs_from_when_twitch_answered() {
        let mut state = State::default();
        let start = Instant::now();
        assert_eq!(state.start_send("1", start), Ok(()));
        let answered = start + Duration::from_secs(2);
        state.finish_send("1", answered);
        assert_eq!(
            state.start_send("1", answered),
            Err(answered + CHANNEL_INTERVAL)
        );
    }

    #[tokio::test(start_paused = true)]
    async fn a_message_which_would_wait_too_long_is_dropped() {
        let limiter = Arc::new(RateLimiter::default());
        let turns: Vec<_> = (0..30)
            .map(|_| {
                let limiter = limiter.clone();
                tokio::spawn(async move { limiter.turn("1").await.is_ok() })
            })
            .collect();
        let mut sent = 0;
        for turn in turns {
            if turn.await.unwrap() {
                sent += 1;
            }
        }
        // 20 in the first window, 1.1 seconds apart. The rest would wait for it to pass, 32 seconds
        // in, which is longer than a message may wait.
        assert_eq!(sent, 20);
    }
}
