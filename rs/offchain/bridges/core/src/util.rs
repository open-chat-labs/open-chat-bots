use ic_agent::export::Principal;
use oc_bots_sdk::types::{
    BlobReference, BridgedUser, CanisterId, Chat, CryptoTransaction, MessageContent, MessageId,
    UserId,
};
use sha2::{Digest, Sha256};

/// The OpenChat message id a message on the other platform is relayed with. It's derived from the
/// message, so a send which is retried can't post it twice, and its edits and deletion can be
/// relayed without looking the id up.
pub fn inbound_message_id(platform_chat: &str, platform_message: &str) -> MessageId {
    let hash = Sha256::digest(format!("{platform_chat}/{platform_message}"));
    u64::from_be_bytes(hash[..8].try_into().unwrap()).into()
}

/// Stable across restarts and versions, unlike std's hasher
pub fn content_hash(text: &str) -> u64 {
    let hash = Sha256::digest(text);
    u64::from_be_bytes(hash[..8].try_into().unwrap())
}

pub fn canister_id_from_text(text: &str) -> anyhow::Result<CanisterId> {
    Ok(Principal::from_text(text.trim())?.into())
}

/// The url of an OpenChat user's avatar, as the website builds it. A user in a MultiUser canister,
/// whose id carries their index within it, has their avatar served by that canister.
pub fn user_avatar_url(
    user_id: UserId,
    avatar_id: u128,
    is_bot: bool,
    user_index: CanisterId,
) -> String {
    if is_bot {
        return format!("https://{user_index}.raw.icp0.io/avatar/{user_id}/{avatar_id}");
    }

    let principal = Principal::from(user_id);
    let bytes = principal.as_slice();
    if bytes.len() == 10 && bytes[9] & 0x80 != 0 {
        let mut canister_id = bytes[..8].to_vec();
        canister_id.extend_from_slice(&[0x01, 0x01]);
        let canister_id = Principal::from_slice(&canister_id);
        let index = bytes[8] as u32 | (((bytes[9] & 0x7f) as u32) << 8);
        format!("https://{canister_id}.raw.icp0.io/user/{index}/avatar/{avatar_id}")
    } else {
        format!("https://{principal}.raw.icp0.io/avatar/{avatar_id}")
    }
}

/// Where a chat is on OpenChat's website
pub fn oc_chat_url(chat: &Chat) -> String {
    match chat {
        Chat::Direct(id) => format!("https://oc.app/user/{id}"),
        Chat::Group(id) => format!("https://oc.app/group/{id}"),
        Chat::Channel(community, channel) => {
            format!("https://oc.app/community/{community}/channel/{channel}")
        }
    }
}

/// The url of an image, video or file in OpenChat's storage
pub fn blob_url(blob: &BlobReference) -> String {
    format!(
        "https://{}.raw.icp0.io/blobs/{}",
        blob.canister_id, blob.blob_id
    )
}

/// Where the Telegram bridge copies users' profile photos, as the urls of Telegram's own copies
/// contain the bot's token. The website has it as `OC_BRIDGE_AVATARS_URL`.
pub const BRIDGE_AVATARS_URL: &str = "https://d31v79nf0k3ss4.cloudfront.net";

/// Where Twitch serves profile images. A Twitch profile has its image's path on it.
pub const TWITCH_CDN_URL: &str = "https://static-cdn.jtvnw.net";

/// The url of a bridged account's avatar, if it has one
pub fn bridged_avatar_url(user: &BridgedUser) -> Option<String> {
    match user {
        BridgedUser::Discord(u) => u
            .avatar
            .as_ref()
            .map(|hash| format!("https://cdn.discordapp.com/avatars/{}/{hash}.png", u.id)),
        BridgedUser::Telegram(u) => u
            .photo_id
            .as_ref()
            .map(|photo_id| format!("{BRIDGE_AVATARS_URL}/telegram/{}/{photo_id}.jpg", u.id)),
        BridgedUser::Twitch(u) => u
            .profile_image
            .as_ref()
            .map(|path| format!("{TWITCH_CDN_URL}/{path}")),
    }
}

pub fn bridged_name(user: &BridgedUser) -> String {
    match user {
        BridgedUser::Discord(u) => u.display_name.clone().unwrap_or_else(|| u.username.clone()),
        BridgedUser::Telegram(u) => u.display_name.clone(),
        BridgedUser::Twitch(u) => u.display_name.clone(),
    }
}

/// The ledger of the tokens a message transfers, whose decimals `message_text` needs to show the
/// amount
pub fn transfer_ledger(content: &MessageContent) -> Option<CanisterId> {
    match content {
        MessageContent::Crypto(c) => c.transfer.ledger_canister_id(),
        _ => None,
    }
}

/// An OpenChat message's content as plain text to post on another platform, with a link to any
/// media, or None if it was deleted. Mentions are left as OpenChat writes them, `@UserId(...)`.
/// `token_decimals` are those of the token at `transfer_ledger`, without which a transfer's amount
/// isn't shown.
pub fn message_text(content: &MessageContent, token_decimals: Option<u8>) -> Option<String> {
    let with_caption = |text: String, caption: &Option<String>| match caption {
        Some(caption) if !caption.is_empty() => format!("{text}\n\n{caption}"),
        _ => text,
    };
    let tokens = |units: Option<u128>, symbol: Option<&str>| {
        let symbol = symbol.unwrap_or("tokens");
        match (units, token_decimals) {
            (Some(units), Some(decimals)) => format!("{} {symbol}", format_tokens(units, decimals)),
            _ => symbol.to_string(),
        }
    };
    let with_link = |caption: &Option<String>, label: &str, blob: Option<&BlobReference>| {
        let link = blob.map_or(format!("[{label}]"), |b| {
            format!("[{label}]({})", blob_url(b))
        });
        match caption {
            Some(caption) if !caption.is_empty() => format!("{caption}\n{link}"),
            _ => link,
        }
    };

    Some(match content {
        MessageContent::Text(t) => t.text.clone(),
        MessageContent::Image(i) => with_link(&i.caption, "image", i.blob_reference.as_ref()),
        MessageContent::Video(v) => with_link(&v.caption, "video", v.video_blob_reference.as_ref()),
        MessageContent::Audio(a) => with_link(&a.caption, "audio", a.blob_reference.as_ref()),
        MessageContent::File(f) => with_link(&f.caption, &f.name, f.blob_reference.as_ref()),
        MessageContent::Giphy(g) => {
            let link = format!("[GIF]({})", g.desktop.url);
            match &g.caption {
                Some(caption) if !caption.is_empty() => format!("{caption}\n{link}"),
                _ => link,
            }
        }
        MessageContent::Poll(p) => {
            let mut text = format!("📊 {}", p.config.text.clone().unwrap_or_default());
            for option in &p.config.options {
                text.push_str(&format!("\n• {option}"));
            }
            text
        }
        MessageContent::Crypto(c) => {
            let verb = match c.transfer {
                CryptoTransaction::Pending(_) => "Sending",
                CryptoTransaction::Completed(_) => "Sent",
                CryptoTransaction::Failed(_) => "Failed to send",
            };
            let tokens = tokens(c.transfer.units(), c.transfer.token_symbol());
            let text = format!("[Crypto] {verb} {tokens} to @UserId({})", c.recipient);
            with_caption(text, &c.caption)
        }
        // The prizes' amounts aren't shown until they're claimed. Every prize is counted, claimed
        // or not, so the text doesn't change as they're claimed.
        MessageContent::Prize(p) => {
            let count = p.prizes_remaining + p.prizes_pending + p.winner_count;
            let plural = if count == 1 { "" } else { "s" };
            let text = format!(
                "[Prize] {count} {} prize{plural} to claim in OpenChat",
                p.token_symbol
            );
            with_caption(text, &p.caption)
        }
        MessageContent::P2PSwap(s) => {
            let text = format!(
                "[P2P swap] {} {} for {} {}",
                format_tokens(s.token0_amount, s.token0.decimals),
                s.token0.symbol,
                format_tokens(s.token1_amount, s.token1.decimals),
                s.token1.symbol
            );
            with_caption(text, &s.caption)
        }
        MessageContent::GovernanceProposal(p) => format!("[Proposal] {}", p.proposal.title()),
        MessageContent::VideoCall(c) if c.audio_only => "[Audio call]".to_string(),
        MessageContent::VideoCall(_) => "[Video call]".to_string(),
        MessageContent::MessageReminderCreated(r) => {
            with_caption("[Reminder]".to_string(), &r.notes)
        }
        MessageContent::MessageReminder(r) => with_caption("[Reminder]".to_string(), &r.notes),
        // Winners are announced in the prize's thread, which isn't relayed
        MessageContent::PrizeWinner(_) => "[Prize winner]".to_string(),
        MessageContent::ReportedMessage(_) => "[Reported message]".to_string(),
        MessageContent::ModerationReport(_) => "[Moderation report]".to_string(),
        MessageContent::Encrypted(_) => "[Encrypted message]".to_string(),
        MessageContent::Custom(c) => format!("[{}]", c.kind),
        MessageContent::Unsupported(u) => format!("[{}]", u.kind),
        MessageContent::Deleted(_) => return None,
    })
}

/// An amount of a token, given in its smallest units, to at least 2 decimal places, eg. 1.00 or
/// 0.125
pub fn format_tokens(units: u128, decimals: u8) -> String {
    let decimals = usize::from(decimals);
    let digits = format!("{units:0>width$}", width = decimals + 1);
    let (whole, fraction) = digits.split_at(digits.len() - decimals);
    format!("{whole}.{:0<2}", fraction.trim_end_matches('0'))
}

/// OpenChat notifies every member of a chat of `@everyone` in a bot's message, so text relayed from
/// a platform has it broken up with a zero-width space, unless its author could mention everyone
/// there
pub fn without_mention_everyone(text: &str) -> String {
    text.replace("@everyone", "@\u{200B}everyone")
}

/// The ids of the users mentioned in OpenChat text, written `@UserId(<id>)`
pub fn mentioned_user_ids(text: &str) -> Vec<UserId> {
    let mut ids = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find("@UserId(") {
        rest = &rest[start + "@UserId(".len()..];
        let Some(end) = rest.find(')') else {
            break;
        };
        if let Ok(principal) = Principal::from_text(&rest[..end])
            && !ids.contains(&principal.into())
        {
            ids.push(principal.into());
        }
        rest = &rest[end..];
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::*;
    use oc_bots_sdk::types::icrc1::{Account, CryptoAccount};
    use oc_bots_sdk::types::{
        CompletedCryptoTransaction, CryptoContent, DeletedBy, P2PSwapContent, P2PSwapStatus,
        PrizeContent, TelegramUser, TextContent, TokenInfo, TwitchUser, icrc1,
    };

    #[test]
    fn inbound_message_ids_are_stable_and_distinct() {
        assert_eq!(inbound_message_id("1", "2"), inbound_message_id("1", "2"));
        assert_ne!(inbound_message_id("1", "2"), inbound_message_id("1", "3"));
        assert_ne!(inbound_message_id("1", "23"), inbound_message_id("12", "3"));
    }

    #[test]
    fn a_telegram_users_photo_is_on_the_bridges_cdn() {
        let user = |photo_id: Option<&str>| {
            BridgedUser::Telegram(TelegramUser {
                id: 123456789,
                username: None,
                display_name: "Ann".to_string(),
                photo_id: photo_id.map(str::to_string),
            })
        };
        assert_eq!(
            bridged_avatar_url(&user(Some("AQADtLwxG5a_QEZ-"))).as_deref(),
            Some("https://d31v79nf0k3ss4.cloudfront.net/telegram/123456789/AQADtLwxG5a_QEZ-.jpg")
        );
        assert_eq!(bridged_avatar_url(&user(None)), None);
    }

    #[test]
    fn a_twitch_users_image_is_on_twitchs_cdn() {
        let user = |profile_image: Option<&str>| {
            BridgedUser::Twitch(TwitchUser {
                id: 141981764,
                login: "nelly".to_string(),
                display_name: "Nelly".to_string(),
                profile_image: profile_image.map(str::to_string),
            })
        };
        assert_eq!(
            bridged_avatar_url(&user(Some(
                "jtv_user_pictures/abc-profile_image-300x300.png"
            )))
            .as_deref(),
            Some("https://static-cdn.jtvnw.net/jtv_user_pictures/abc-profile_image-300x300.png")
        );
        assert_eq!(bridged_avatar_url(&user(None)), None);
        assert_eq!(bridged_name(&user(None)), "Nelly");
    }

    #[test]
    fn avatar_url_of_a_user_in_a_multi_user_canister() {
        let canister = Principal::from_slice(&[0, 0, 0, 0, 0, 1, 2, 3, 0x01, 0x01]);
        // Index 300 in the canister: its low byte, then the rest with the indexed tag set
        let user = Principal::from_slice(&[0, 0, 0, 0, 0, 1, 2, 3, 44, 0x81]);
        let user_index: CanisterId = Principal::anonymous().into();

        assert_eq!(
            user_avatar_url(user.into(), 99, false, user_index),
            format!("https://{canister}.raw.icp0.io/user/300/avatar/99")
        );
        assert_eq!(
            user_avatar_url(canister.into(), 99, false, user_index),
            format!("https://{canister}.raw.icp0.io/avatar/99")
        );
    }

    #[test]
    fn chat_urls_match_the_website_routes() {
        let community: CanisterId = Principal::from_slice(&[1]).into();
        let group: CanisterId = Principal::from_slice(&[2]).into();
        assert_eq!(
            oc_chat_url(&Chat::Group(group)),
            format!("https://oc.app/group/{group}")
        );
        assert_eq!(
            oc_chat_url(&Chat::Channel(community, 2656124989)),
            format!("https://oc.app/community/{community}/channel/2656124989")
        );
    }

    #[test]
    fn mentions_are_found_once_each() {
        let alice = Principal::from_slice(&[1]);
        let bob = Principal::from_slice(&[2]);
        let text = format!(
            "hi @UserId({alice}) and @UserId({bob}), @UserId({alice}) again, @UserId(nope)"
        );

        let expected: Vec<UserId> = vec![alice.into(), bob.into()];
        assert_eq!(mentioned_user_ids(&text), expected);
    }

    #[test]
    fn deleted_content_has_no_text() {
        assert_eq!(
            message_text(
                &MessageContent::Text(TextContent {
                    text: "hello".to_string()
                }),
                None
            ),
            Some("hello".to_string())
        );
        assert_eq!(
            message_text(
                &MessageContent::Deleted(DeletedBy {
                    deleted_by: Principal::anonymous().into(),
                    timestamp: 1,
                }),
                None
            ),
            None
        );
    }

    #[test]
    fn a_transfer_shows_its_amount_and_recipient() {
        let ledger: CanisterId = Principal::from_slice(&[1]).into();
        let recipient: UserId = Principal::from_slice(&[2]).into();
        let content = MessageContent::Crypto(CryptoContent {
            recipient,
            transfer: CryptoTransaction::Completed(CompletedCryptoTransaction::ICRC1(
                icrc1::CompletedCryptoTransaction {
                    ledger,
                    token_symbol: "CHAT".to_string(),
                    amount: 100_000_000,
                    from: CryptoAccount::Account(Account {
                        owner: Principal::from_slice(&[3]),
                        subaccount: None,
                    }),
                    to: CryptoAccount::Account(Account {
                        owner: recipient.into(),
                        subaccount: None,
                    }),
                    fee: 100_000,
                    memo: None,
                    created: 1,
                    block_index: 1,
                },
            )),
            caption: Some("BlahBlah".to_string()),
        });

        assert_eq!(transfer_ledger(&content), Some(ledger));
        assert_eq!(
            message_text(&content, Some(8)).unwrap(),
            format!("[Crypto] Sent 1.00 CHAT to @UserId({recipient})\n\nBlahBlah")
        );
        // The amount is left out if the token's decimals couldn't be looked up
        assert_eq!(
            message_text(&content, None).unwrap(),
            format!("[Crypto] Sent CHAT to @UserId({recipient})\n\nBlahBlah")
        );
    }

    #[test]
    fn a_prize_counts_every_prize() {
        let prize = |prizes_remaining, prizes_pending, winner_count| {
            MessageContent::Prize(PrizeContent {
                prizes_remaining,
                prizes_pending,
                winner_count,
                user_is_winner: false,
                token_symbol: "CHAT".to_string(),
                ledger: Principal::from_slice(&[1]).into(),
                end_date: 1,
                caption: None,
                diamond_only: false,
                lifetime_diamond_only: false,
                unique_person_only: false,
                streak_only: 0,
                requires_captcha: false,
                min_chit_earned: 0,
            })
        };

        assert_eq!(
            message_text(&prize(3, 1, 1), None).unwrap(),
            "[Prize] 5 CHAT prizes to claim in OpenChat"
        );
        assert_eq!(
            message_text(&prize(1, 0, 0), None).unwrap(),
            "[Prize] 1 CHAT prize to claim in OpenChat"
        );
    }

    #[test]
    fn a_swap_shows_both_tokens() {
        let token = |symbol: &str, decimals| TokenInfo {
            symbol: symbol.to_string(),
            ledger: Principal::from_slice(&[1]).into(),
            decimals,
            fee: 0,
        };
        let content = MessageContent::P2PSwap(P2PSwapContent {
            swap_id: 1,
            token0: token("CHAT", 8),
            token0_amount: 1_050_000_000,
            token1: token("ckETH", 18),
            token1_amount: 1_000_000_000_000_000,
            expires_at: 1,
            caption: Some("Anyone?".to_string()),
            token0_txn_in: 1,
            status: P2PSwapStatus::Open,
        });

        assert_eq!(transfer_ledger(&content), None);
        assert_eq!(
            message_text(&content, None).unwrap(),
            "[P2P swap] 10.50 CHAT for 0.001 ckETH\n\nAnyone?"
        );
    }

    #[test]
    fn token_amounts_have_at_least_2_decimal_places() {
        assert_eq!(format_tokens(100_000_000, 8), "1.00");
        assert_eq!(format_tokens(12_345_678, 8), "0.12345678");
        assert_eq!(format_tokens(150_000_000, 8), "1.50");
        assert_eq!(format_tokens(7, 0), "7.00");
        assert_eq!(format_tokens(1, 18), "0.000000000000000001");
        assert_eq!(format_tokens(u128::MAX, 0), format!("{}.00", u128::MAX));
        assert_eq!(format_tokens(5, 40), format!("0.{}5", "0".repeat(39)));
    }
}
