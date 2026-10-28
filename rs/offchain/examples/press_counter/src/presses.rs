use oc_bots_sdk::types::{
    CanisterId, Milliseconds, MiniAppCard, MiniAppContent, MiniAppStatus, MiniAppUpdate,
    TimestampMillis, UserId,
};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;

/// A user who's called the API for a card within this long has the app open
const VIEWER_TTL: Milliseconds = 60_000;
/// The card's spectator count is updated at most this often
const SPECTATOR_COUNT_INTERVAL: Milliseconds = 5_000;
/// How long to wait before trying again to update a card OpenChat refused to
const RETRY_AFTER: Milliseconds = 30_000;

/// How many times each user has pressed the button, for each card the bot has posted, and what
/// each card shows. They're kept in memory, so they're lost when the bot is restarted. A card's
/// counts start when its app is first opened: OpenChat only gives a token for a card which is one of
/// the bot's MiniApp messages, so every key is a card the bot posted.
#[derive(Default)]
pub struct Presses {
    cards: Mutex<HashMap<MiniAppCard, Card>>,
}

#[derive(Default)]
struct Card {
    counts: HashMap<UserId, u64>,
    /// Who's pressed, in the order they first did, as the card lists them
    players: Vec<UserId>,
    /// When each user last called the API for the card
    viewers: HashMap<UserId, TimestampMillis>,
    /// The LocalUserIndex the bot updates the card through, from the latest session
    api_gateway: Option<CanisterId>,
    /// What the card shows, as the bot last updated it
    shown: Shown,
    /// Not updated again until then, after OpenChat refused an update
    retry_at: TimestampMillis,
}

#[derive(Default)]
struct Shown {
    players: Vec<UserId>,
    status: MiniAppStatus,
    spectator_count: u32,
    /// When the bot last updated the spectator count, if ever
    spectator_count_at: Option<TimestampMillis>,
}

/// What the app shows a user
#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct PressesView {
    /// The user the app is showing this to
    pub user_id: UserId,
    pub total: u64,
    /// Each user who has pressed the button, most presses first
    pub presses: Vec<UserPresses>,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct UserPresses {
    pub user_id: UserId,
    pub count: u64,
}

/// An update to send to one of the cards
#[derive(Debug, PartialEq, Eq)]
pub struct CardUpdate {
    pub card: MiniAppCard,
    pub api_gateway: CanisterId,
    pub update: MiniAppUpdate,
}

impl Presses {
    /// Counts a press. The user's first press makes them a player, while the card lists fewer than
    /// it can.
    pub fn press(
        &self,
        card: MiniAppCard,
        api_gateway: CanisterId,
        user_id: UserId,
        now: TimestampMillis,
    ) -> PressesView {
        let mut cards = self.cards.lock().unwrap();
        let state = cards.entry(card).or_default();
        state.seen(api_gateway, user_id, now);

        let count = state.counts.entry(user_id).or_default();
        if *count == 0 && state.players.len() < MiniAppContent::MAX_PLAYERS {
            state.players.push(user_id);
        }
        *count += 1;
        state.view(user_id)
    }

    pub fn get(
        &self,
        card: MiniAppCard,
        api_gateway: CanisterId,
        user_id: UserId,
        now: TimestampMillis,
    ) -> PressesView {
        let mut cards = self.cards.lock().unwrap();
        let state = cards.entry(card).or_default();
        state.seen(api_gateway, user_id, now);
        state.view(user_id)
    }

    /// The updates the cards need to show who's playing, that the game is on once anyone has
    /// pressed, and how many others have the app open. The spectator count changes at most every
    /// few seconds, and a card OpenChat refused an update to is left for a while.
    pub fn due_updates(&self, now: TimestampMillis) -> Vec<CardUpdate> {
        let mut cards = self.cards.lock().unwrap();
        cards
            .iter_mut()
            .filter_map(|(card, state)| {
                let update = state.due_update(now)?;
                Some(CardUpdate {
                    card: *card,
                    api_gateway: state.api_gateway?,
                    update,
                })
            })
            .collect()
    }

    /// OpenChat took the update, so the card now shows it
    pub fn updated(&self, update: &CardUpdate, now: TimestampMillis) {
        let mut cards = self.cards.lock().unwrap();
        if let Some(state) = cards.get_mut(&update.card) {
            let shown = &mut state.shown;
            if let Some(players) = &update.update.players {
                shown.players = players.clone();
            }
            if let Some(status) = update.update.status {
                shown.status = status;
            }
            if let Some(spectator_count) = update.update.spectator_count {
                shown.spectator_count = spectator_count;
                shown.spectator_count_at = Some(now);
            }
        }
    }

    /// OpenChat refused the update, eg. as the card was deleted, so it's tried again later
    pub fn failed(&self, update: &CardUpdate, now: TimestampMillis) {
        let mut cards = self.cards.lock().unwrap();
        if let Some(state) = cards.get_mut(&update.card) {
            state.retry_at = now + RETRY_AFTER;
        }
    }
}

impl Card {
    fn seen(&mut self, api_gateway: CanisterId, user_id: UserId, now: TimestampMillis) {
        self.api_gateway = Some(api_gateway);
        self.viewers.insert(user_id, now);
    }

    fn view(&self, user_id: UserId) -> PressesView {
        let mut presses: Vec<_> = self
            .counts
            .iter()
            .map(|(&user_id, &count)| UserPresses { user_id, count })
            .collect();
        // Most presses first, and in a fixed order otherwise, so the table doesn't jump about
        presses.sort_by(|a, b| {
            b.count
                .cmp(&a.count)
                .then_with(|| a.user_id.cmp(&b.user_id))
        });

        PressesView {
            user_id,
            total: presses.iter().map(|p| p.count).sum(),
            presses,
        }
    }

    // Those with the app open who haven't pressed
    fn spectator_count(&mut self, now: TimestampMillis) -> u32 {
        self.viewers
            .retain(|_, last_seen| now.saturating_sub(*last_seen) < VIEWER_TTL);
        self.viewers
            .keys()
            .filter(|user_id| !self.counts.contains_key(user_id))
            .count() as u32
    }

    fn due_update(&mut self, now: TimestampMillis) -> Option<MiniAppUpdate> {
        if now < self.retry_at {
            return None;
        }
        let mut update = MiniAppUpdate::default();
        if self.players != self.shown.players {
            update = update.with_players(self.players.clone());
        }
        // Once anyone has pressed
        if !self.players.is_empty() && self.shown.status != MiniAppStatus::Active {
            update = update.with_status(MiniAppStatus::Active);
        }
        let spectator_count = self.spectator_count(now);
        if spectator_count != self.shown.spectator_count
            && self
                .shown
                .spectator_count_at
                .is_none_or(|at| now.saturating_sub(at) >= SPECTATOR_COUNT_INTERVAL)
        {
            update = update.with_spectator_count(spectator_count);
        }
        (update != MiniAppUpdate::default()).then_some(update)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ic_principal::Principal;
    use oc_bots_sdk::types::{Chat, MessageId};

    fn user(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    fn card(message_id: u64, thread: Option<u32>) -> MiniAppCard {
        MiniAppCard {
            chat: Chat::Group(user(200)),
            thread,
            message_id: MessageId::from(message_id),
        }
    }

    fn gateway() -> CanisterId {
        user(201)
    }

    fn press(presses: &Presses, card: MiniAppCard, user_id: UserId, now: u64) -> PressesView {
        presses.press(card, gateway(), user_id, now)
    }

    fn get(presses: &Presses, card: MiniAppCard, user_id: UserId, now: u64) -> PressesView {
        presses.get(card, gateway(), user_id, now)
    }

    // Sends whatever's due, as the bot does, and returns it
    fn sync(presses: &Presses, now: u64) -> Vec<MiniAppUpdate> {
        let due = presses.due_updates(now);
        for update in &due {
            presses.updated(update, now);
        }
        due.into_iter().map(|u| u.update).collect()
    }

    #[test]
    fn each_users_presses_are_counted() {
        let presses = Presses::default();

        press(&presses, card(1, None), user(1), 0);
        press(&presses, card(1, None), user(2), 0);
        let view = press(&presses, card(1, None), user(2), 0);

        assert_eq!(
            view,
            PressesView {
                user_id: user(2),
                total: 3,
                presses: vec![
                    UserPresses {
                        user_id: user(2),
                        count: 2
                    },
                    UserPresses {
                        user_id: user(1),
                        count: 1
                    },
                ],
            }
        );
        let other = get(&presses, card(1, None), user(3), 0);
        assert_eq!((other.total, other.user_id), (3, user(3)));
    }

    #[test]
    fn each_card_has_its_own_counts() {
        let presses = Presses::default();
        press(&presses, card(1, None), user(1), 0);

        // The same message id in a thread is another card
        assert_eq!(get(&presses, card(1, Some(0)), user(1), 0).total, 0);
        assert_eq!(get(&presses, card(2, None), user(1), 0).total, 0);
        assert_eq!(press(&presses, card(2, None), user(1), 0).total, 1);
        assert_eq!(get(&presses, card(1, None), user(1), 0).total, 1);
    }

    #[test]
    fn ties_are_in_a_fixed_order() {
        let presses = Presses::default();
        press(&presses, card(1, None), user(2), 0);
        press(&presses, card(1, None), user(1), 0);

        let order: Vec<_> = get(&presses, card(1, None), user(1), 0)
            .presses
            .into_iter()
            .map(|p| p.user_id)
            .collect();

        assert_eq!(order, [user(1), user(2)]);
    }

    #[test]
    fn the_view_is_the_json_the_app_reads() {
        let presses = Presses::default();
        let json = serde_json::to_value(press(&presses, card(1, None), user(1), 0)).unwrap();

        assert_eq!(
            json,
            serde_json::json!({
                "user_id": user(1).to_string(),
                "total": 1,
                "presses": [{ "user_id": user(1).to_string(), "count": 1 }],
            })
        );
    }

    #[test]
    fn a_first_press_lists_the_player_and_starts_the_game() {
        let presses = Presses::default();
        get(&presses, card(1, None), user(1), 0);
        // Only looking: one spectator
        assert_eq!(
            sync(&presses, 0),
            [MiniAppUpdate::default().with_spectator_count(1)]
        );

        press(&presses, card(1, None), user(1), 1);
        let due = presses.due_updates(1);
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].card, card(1, None));
        assert_eq!(due[0].api_gateway, gateway());
        // A player isn't a spectator, but the count waits until it's been 5s since the last
        assert_eq!(
            due[0].update,
            MiniAppUpdate::default()
                .with_players(vec![user(1)])
                .with_status(MiniAppStatus::Active)
        );
        presses.updated(&due[0], 1);

        // Pressing again changes nothing on the card, but another player does
        press(&presses, card(1, None), user(1), 2);
        press(&presses, card(1, None), user(2), 2);
        assert_eq!(
            sync(&presses, 2),
            [MiniAppUpdate::default().with_players(vec![user(1), user(2)])]
        );
        assert_eq!(sync(&presses, 3), Vec::<MiniAppUpdate>::new());
        assert_eq!(
            sync(&presses, 5_000),
            [MiniAppUpdate::default().with_spectator_count(0)]
        );
    }

    #[test]
    fn the_spectator_count_changes_at_most_every_5_seconds() {
        let presses = Presses::default();
        get(&presses, card(1, None), user(1), 0);
        assert_eq!(
            sync(&presses, 0),
            [MiniAppUpdate::default().with_spectator_count(1)]
        );

        get(&presses, card(1, None), user(2), 1_000);
        assert_eq!(sync(&presses, 1_000), Vec::<MiniAppUpdate>::new());
        assert_eq!(sync(&presses, 4_999), Vec::<MiniAppUpdate>::new());
        assert_eq!(
            sync(&presses, 5_000),
            [MiniAppUpdate::default().with_spectator_count(2)]
        );
    }

    #[test]
    fn a_spectator_who_stops_calling_leaves_after_a_minute() {
        let presses = Presses::default();
        get(&presses, card(1, None), user(1), 0);
        sync(&presses, 0);

        assert_eq!(sync(&presses, 59_999), Vec::<MiniAppUpdate>::new());
        assert_eq!(
            sync(&presses, 60_000),
            [MiniAppUpdate::default().with_spectator_count(0)]
        );
    }

    #[test]
    fn a_refused_update_is_tried_again_after_30_seconds() {
        let presses = Presses::default();
        press(&presses, card(1, None), user(1), 0);
        let due = presses.due_updates(0);
        presses.failed(&due[0], 0);

        assert_eq!(presses.due_updates(29_999), []);
        assert_eq!(presses.due_updates(30_000)[0].update, due[0].update);
    }

    #[test]
    fn at_most_100_players_are_listed() {
        let presses = Presses::default();
        for i in 0..=100 {
            press(&presses, card(1, None), user(i), 0);
        }

        let due = presses.due_updates(0);
        let players = due[0].update.players.clone().unwrap();
        assert_eq!(players.len(), 100);
        assert!(!players.contains(&user(100)));

        let mut content = MiniAppContent::new("x").with_spectators(true);
        content.apply(due[0].update.clone());
        assert_eq!(content.validate(), Ok(()));
        // All 101 are counted
        assert_eq!(get(&presses, card(1, None), user(1), 0).total, 101);
    }
}
