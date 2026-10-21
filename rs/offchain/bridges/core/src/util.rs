use ic_agent::export::Principal;
use oc_bots_sdk::types::{
    BlobReference, BridgedUser, CanisterId, MessageContent, MessageId, UserId,
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

/// The url of an image, video or file in OpenChat's storage
pub fn blob_url(blob: &BlobReference) -> String {
    format!(
        "https://{}.raw.icp0.io/blobs/{}",
        blob.canister_id, blob.blob_id
    )
}

/// The url of a bridged account's avatar, if it has one
pub fn bridged_avatar_url(user: &BridgedUser) -> Option<String> {
    match user {
        BridgedUser::Discord(u) => u
            .avatar
            .as_ref()
            .map(|hash| format!("https://cdn.discordapp.com/avatars/{}/{hash}.png", u.id)),
        BridgedUser::Telegram(u) => u.avatar.as_ref().map(blob_url),
    }
}

pub fn bridged_name(user: &BridgedUser) -> String {
    match user {
        BridgedUser::Discord(u) => u.display_name.clone().unwrap_or_else(|| u.username.clone()),
        BridgedUser::Telegram(u) => u.display_name.clone(),
    }
}

/// An OpenChat message's content as plain text to post on another platform, with a link to any
/// media, or None if it was deleted. Mentions are left as OpenChat writes them, `@UserId(...)`.
pub fn message_text(content: &MessageContent) -> Option<String> {
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
        MessageContent::Custom(c) => format!("[{}]", c.kind),
        MessageContent::Unsupported(u) => format!("[{}]", u.kind),
        MessageContent::Deleted(_) => return None,
    })
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
    use oc_bots_sdk::types::{DeletedBy, TextContent};

    #[test]
    fn inbound_message_ids_are_stable_and_distinct() {
        assert_eq!(inbound_message_id("1", "2"), inbound_message_id("1", "2"));
        assert_ne!(inbound_message_id("1", "2"), inbound_message_id("1", "3"));
        assert_ne!(inbound_message_id("1", "23"), inbound_message_id("12", "3"));
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
            message_text(&MessageContent::Text(TextContent {
                text: "hello".to_string()
            })),
            Some("hello".to_string())
        );
        assert_eq!(
            message_text(&MessageContent::Deleted(DeletedBy {
                deleted_by: Principal::anonymous().into(),
                timestamp: 1,
            })),
            None
        );
    }
}
