use oc_bots_sdk::types::{MiniAppCard, UserId};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;

/// How many times each user has pressed the button, for each card the bot has posted. They're kept
/// in memory, so they're lost when the bot is restarted. A card's counts start when its app is first
/// opened: OpenChat only gives a token for a card which is one of the bot's MiniApp messages, so
/// every key is a card the bot posted.
#[derive(Default)]
pub struct Presses {
    cards: Mutex<HashMap<MiniAppCard, HashMap<UserId, u64>>>,
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

impl Presses {
    pub fn press(&self, card: MiniAppCard, user_id: UserId) -> PressesView {
        let mut cards = self.cards.lock().unwrap();
        let counts = cards.entry(card).or_default();
        *counts.entry(user_id).or_default() += 1;
        view(counts, user_id)
    }

    pub fn get(&self, card: MiniAppCard, user_id: UserId) -> PressesView {
        let cards = self.cards.lock().unwrap();
        cards
            .get(&card)
            .map(|counts| view(counts, user_id))
            .unwrap_or(PressesView {
                user_id,
                total: 0,
                presses: Vec::new(),
            })
    }
}

fn view(counts: &HashMap<UserId, u64>, user_id: UserId) -> PressesView {
    let mut presses: Vec<_> = counts
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
            chat: Chat::Group(user(9)),
            thread,
            message_id: MessageId::from(message_id),
        }
    }

    #[test]
    fn each_users_presses_are_counted() {
        let presses = Presses::default();

        presses.press(card(1, None), user(1));
        presses.press(card(1, None), user(2));
        let view = presses.press(card(1, None), user(2));

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
        assert_eq!(presses.get(card(1, None), user(3)).total, 3);
        assert_eq!(presses.get(card(1, None), user(3)).user_id, user(3));
    }

    #[test]
    fn each_card_has_its_own_counts() {
        let presses = Presses::default();
        presses.press(card(1, None), user(1));

        // The same message id in a thread is another card
        assert_eq!(presses.get(card(1, Some(0)), user(1)).total, 0);
        assert_eq!(presses.get(card(2, None), user(1)).total, 0);
        assert_eq!(presses.press(card(2, None), user(1)).total, 1);
        assert_eq!(presses.get(card(1, None), user(1)).total, 1);
    }

    #[test]
    fn ties_are_in_a_fixed_order() {
        let presses = Presses::default();
        presses.press(card(1, None), user(2));
        presses.press(card(1, None), user(1));

        let order: Vec<_> = presses
            .get(card(1, None), user(1))
            .presses
            .into_iter()
            .map(|p| p.user_id)
            .collect();

        assert_eq!(order, [user(1), user(2)]);
    }

    #[test]
    fn the_view_is_the_json_the_app_reads() {
        let presses = Presses::default();
        let json = serde_json::to_value(presses.press(card(1, None), user(1))).unwrap();

        assert_eq!(
            json,
            serde_json::json!({
                "user_id": user(1).to_string(),
                "total": 1,
                "presses": [{ "user_id": user(1).to_string(), "count": 1 }],
            })
        );
    }
}
