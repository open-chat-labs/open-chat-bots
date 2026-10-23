use crate::model::Pairing;
use crate::platform::PermanentFailure;
use crate::util::{bridged_avatar_url, bridged_name, user_avatar_url};
use anyhow::{Result, anyhow, bail};
use candid::{Decode, Encode};
use ic_agent::identity::{BasicIdentity, Secp256k1Identity};
use ic_agent::{Agent, Identity};
use oc_bots_sdk::mainnet::{mainnet_oc_public_key, mainnet_user_index_canister_id};
use oc_bots_sdk::oc_api::Runtime;
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::oc_api::actions::bridged_users::Response as BridgedUsersResponse;
use oc_bots_sdk::oc_api::actions::installation_events::Response as InstallationEventsResponse;
use oc_bots_sdk::oc_api::actions::link_bridged_user::Response as LinkResponse;
use oc_bots_sdk::oc_api::actions::send_message::Response as SendResponse;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{
    ActionScope, AutonomousContext, BridgedUser, BridgedUserId, BridgedUserSummary, CallError,
    CanisterId, EventIndex, MessageContentInitial, MessageId, OCError, OCErrorCode,
    TimestampMillis, UnitResult, UserId,
};
use oc_bots_sdk_offchain::{AgentRuntime, OgPreviewConfig, env};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tracing::warn;

// How long a profile is used before it's looked up again
const PROFILE_CACHE_DURATION: u64 = 10 * 60 * 1000;
const RETRY_DELAYS: [Duration; 2] = [Duration::from_secs(1), Duration::from_secs(4)];

pub struct OpenChatConfig {
    pub ic_url: String,
    /// The PEM of the bridge bot's identity, secp256k1 or Ed25519
    pub identity_pem: String,
    /// OpenChat's key, which signs its commands and notifications
    pub public_key: String,
    pub user_index: CanisterId,
}

impl OpenChatConfig {
    /// From `OC_IDENTITY_PEM` (the PEM's text) or `OC_IDENTITY_PEM_FILE`, and for an OpenChat other
    /// than mainnet's, `OC_IC_URL`, `OC_PUBLIC_KEY` and `OC_USER_INDEX`
    pub fn from_env() -> Result<Self> {
        let var = |name: &str| std::env::var(name).ok().filter(|v| !v.trim().is_empty());
        let identity_pem = match (var("OC_IDENTITY_PEM"), var("OC_IDENTITY_PEM_FILE")) {
            (Some(pem), _) => pem,
            (None, Some(file)) => std::fs::read_to_string(&file)
                .map_err(|e| anyhow!("Failed to read OC_IDENTITY_PEM_FILE {file}: {e}"))?,
            (None, None) => bail!("Set OC_IDENTITY_PEM or OC_IDENTITY_PEM_FILE"),
        };

        let mut config = Self::mainnet(identity_pem);
        if let Some(ic_url) = var("OC_IC_URL") {
            config.ic_url = ic_url;
        }
        if let Some(public_key) = var("OC_PUBLIC_KEY") {
            config.public_key = public_key;
        }
        if let Some(user_index) = var("OC_USER_INDEX") {
            config.user_index = crate::util::canister_id_from_text(&user_index)?;
        }
        Ok(config)
    }

    /// Mainnet, with the bot's identity
    pub fn mainnet(identity_pem: String) -> Self {
        OpenChatConfig {
            ic_url: oc_bots_sdk::mainnet::mainnet_ic_url(),
            identity_pem,
            public_key: mainnet_oc_public_key(),
            user_index: mainnet_user_index_canister_id(),
        }
    }
}

/// How a user, or another platform's bridged account, is shown when their message is relayed
#[derive(Clone, Debug, PartialEq)]
pub struct Author {
    pub name: String,
    pub avatar_url: Option<String>,
}

/// The OpenChat user an account was linked to
#[derive(Clone, Debug)]
pub struct LinkedUser {
    pub user_id: UserId,
    pub username: String,
}

/// The bridge bot's side of OpenChat
pub struct OpenChat {
    runtime: Arc<AgentRuntime>,
    principal: CanisterId,
    public_key: String,
    user_index: CanisterId,
    authors: Mutex<HashMap<UserId, (Option<Author>, TimestampMillis)>>,
    // For calls to ledgers, which take candid rather than msgpack
    agent: Agent,
    token_decimals: Mutex<HashMap<CanisterId, u8>>,
    bot_id: tokio::sync::OnceCell<UserId>,
}

impl OpenChat {
    pub async fn new(config: OpenChatConfig) -> Result<Self> {
        let identity = identity_from_pem(&config.identity_pem)?;
        Self::with_identity(config, identity).await
    }

    /// Uses `identity` rather than `config.identity_pem`, eg. in tests
    pub async fn with_identity(
        config: OpenChatConfig,
        identity: Box<dyn Identity>,
    ) -> Result<Self> {
        let principal = identity.sender().map_err(|e| anyhow!(e))?.into();
        let is_mainnet = config.ic_url.contains("icp0.io") || config.ic_url.contains("ic0.app");

        let agent = Agent::builder()
            .with_url(config.ic_url)
            .with_boxed_identity(identity)
            .with_ingress_expiry(Duration::from_secs(60))
            .build()?;
        if !is_mainnet {
            agent.fetch_root_key().await?;
        }

        // Messages are relayed with whatever the other platform showed, so nothing is looked up
        let runtime = AgentRuntime::new_with_og_preview_config(
            agent.clone(),
            tokio::runtime::Runtime::new()?,
            OgPreviewConfig {
                auto_fetch: false,
                ..OgPreviewConfig::default()
            },
        );

        Ok(OpenChat {
            runtime: Arc::new(runtime),
            principal,
            public_key: config.public_key,
            user_index: config.user_index,
            authors: Mutex::default(),
            agent,
            token_decimals: Mutex::default(),
            bot_id: tokio::sync::OnceCell::new(),
        })
    }

    /// The bridge bot's principal. OpenChat gives the bot a user id of its own when it's
    /// registered.
    pub fn principal(&self) -> CanisterId {
        self.principal
    }

    pub fn public_key(&self) -> &str {
        &self.public_key
    }

    fn client(&self, pairing: &Pairing) -> Client<AgentRuntime, AutonomousContext> {
        Client::new(
            self.runtime.clone(),
            AutonomousContext {
                api_gateway: pairing.api_gateway,
                scope: ActionScope::Chat(pairing.oc_chat),
            },
        )
    }

    fn user_index_client(&self) -> Client<AgentRuntime, CanisterId> {
        Client::new(self.runtime.clone(), self.user_index)
    }

    /// Relays a message from the other platform as written by `author`. Returns its event index,
    /// unless an earlier attempt which seemed to fail had sent it.
    pub async fn send(
        &self,
        pairing: &Pairing,
        message_id: MessageId,
        author: BridgedUser,
        text: String,
        replies_to: Option<EventIndex>,
    ) -> Result<Option<EventIndex>> {
        let response = with_retries(|| {
            let client = self.client(pairing);
            let (text, author) = (text.clone(), author.clone());
            async move {
                client
                    .send_message(MessageContentInitial::from_text(text))
                    .with_message_id(message_id)
                    .with_bridged_from(author)
                    .replies_to(replies_to)
                    .execute_async()
                    .await
            }
        })
        .await?;

        match response {
            SendResponse::Success(result) => Ok(Some(result.event_index)),
            SendResponse::Error(error)
                if error.matches_code(OCErrorCode::MessageIdAlreadyExists) =>
            {
                Ok(None)
            }
            SendResponse::Error(error) => Err(oc_error(error)),
        }
    }

    /// Posts a message as the bot itself rather than relaying one, eg. to say the chat is now
    /// bridged
    pub async fn send_notice(&self, pairing: &Pairing, text: String) -> Result<()> {
        // One id for every attempt, so a call which landed but is retried isn't posted twice
        let message_id: MessageId = rand::random::<u64>().into();
        let response = with_retries(|| {
            let client = self.client(pairing);
            let text = text.clone();
            async move {
                client
                    .send_message(MessageContentInitial::from_text(text))
                    .with_message_id(message_id)
                    .execute_async()
                    .await
            }
        })
        .await?;
        match response {
            SendResponse::Success(_) => Ok(()),
            SendResponse::Error(error)
                if error.matches_code(OCErrorCode::MessageIdAlreadyExists) =>
            {
                Ok(())
            }
            SendResponse::Error(error) => Err(oc_error(error)),
        }
    }

    /// The bot's own user id, which OpenChat gave it when it was registered, eg. to tell its own
    /// messages from others'
    pub async fn bot_id(&self) -> Result<UserId> {
        self.bot_id
            .get_or_try_init(|| async {
                let response = with_retries(|| {
                    let client = self.user_index_client();
                    async move { client.installation_events().size(0).execute_async().await }
                })
                .await?;
                match response {
                    InstallationEventsResponse::Success(result) => Ok(result.bot_id),
                    InstallationEventsResponse::Error(error) => Err(oc_error(error)),
                }
            })
            .await
            .copied()
    }

    pub async fn edit(&self, pairing: &Pairing, message_id: MessageId, text: String) -> Result<()> {
        let response = with_retries(|| {
            let client = self.client(pairing);
            let text = text.clone();
            async move {
                client
                    .edit_message(message_id, MessageContentInitial::from_text(text))
                    .execute_async()
                    .await
            }
        })
        .await?;
        unit_result(response)
    }

    pub async fn delete(&self, pairing: &Pairing, message_id: MessageId) -> Result<()> {
        let response = with_retries(|| {
            let client = self.client(pairing);
            async move {
                client
                    .delete_messages(vec![message_id])
                    .execute_async()
                    .await
            }
        })
        .await?;
        unit_result(response)
    }

    /// Links the account to the OpenChat user who was given `code` from their profile
    pub async fn link(&self, user: BridgedUser, code: String) -> Result<LinkedUser> {
        let response = with_retries(|| {
            let client = self.user_index_client();
            let (user, code) = (user.clone(), code.clone());
            async move { client.link_bridged_user(user, code).execute_async().await }
        })
        .await?;

        match response {
            LinkResponse::Success(result) => Ok(LinkedUser {
                user_id: result.user_id,
                username: result.username,
            }),
            LinkResponse::Error(error) => Err(oc_error(error)),
        }
    }

    /// The id of the OpenChat user the account is linked to, if any
    pub async fn linked_user_id(&self, id: BridgedUserId) -> Result<Option<UserId>> {
        let response = with_retries(|| {
            let client = self.user_index_client();
            async move { client.bridged_users(vec![id]).execute_async().await }
        })
        .await?;
        let BridgedUsersResponse::Success(users) = response;
        Ok(users.into_iter().next().and_then(|u| u.linked_user_id))
    }

    /// The OpenChat user the account is linked to, if any
    pub async fn linked_user(&self, id: BridgedUserId) -> Result<Option<LinkedUser>> {
        let Some(user_id) = self.linked_user_id(id).await? else {
            return Ok(None);
        };
        Ok(self.fetch_user(user_id).await?.map(|user| LinkedUser {
            user_id,
            username: user.username,
        }))
    }

    /// Unlinks the account from whoever it's linked to
    pub async fn unlink(&self, user: BridgedUserId) -> Result<()> {
        let response = with_retries(|| {
            let client = self.user_index_client();
            async move { client.unlink_bridged_user(user).execute_async().await }
        })
        .await?;
        unit_result(response)
    }

    /// How an OpenChat user is shown, or None if they can't be found
    pub async fn author(&self, user_id: UserId) -> Option<Author> {
        let now = env::now();
        if let Some((author, fetched)) = self.authors.lock().unwrap().get(&user_id)
            && now < fetched + PROFILE_CACHE_DURATION
        {
            return author.clone();
        }

        let author = match self.fetch_user(user_id).await {
            Ok(Some(user)) => Some(Author {
                name: user.display_name.unwrap_or(user.username),
                avatar_url: user
                    .avatar_id
                    .map(|id| user_avatar_url(user.user_id, id, user.is_bot, self.user_index)),
            }),
            Ok(None) => None,
            Err(error) => {
                // Not cached, so it's tried again next time
                warn!(%user_id, ?error, "Failed to look up user");
                return None;
            }
        };
        self.authors
            .lock()
            .unwrap()
            .insert(user_id, (author.clone(), now));
        author
    }

    /// How many decimal places a token's amounts have, from its ledger, or None if it can't be
    /// looked up
    pub async fn token_decimals(&self, ledger: CanisterId) -> Option<u8> {
        if let Some(decimals) = self.token_decimals.lock().unwrap().get(&ledger) {
            return Some(*decimals);
        }

        let response = self
            .agent
            .query(&ledger.into(), "icrc1_decimals")
            .with_arg(Encode!().unwrap())
            .call()
            .await;
        match response
            .map_err(anyhow::Error::from)
            .and_then(|bytes| Ok(Decode!(&bytes, u8)?))
        {
            Ok(decimals) => {
                self.token_decimals.lock().unwrap().insert(ledger, decimals);
                Some(decimals)
            }
            Err(error) => {
                // Not cached, so it's tried again next time
                warn!(%ledger, ?error, "Failed to look up a token's decimals");
                None
            }
        }
    }

    /// The profile of an account another bridge bot relays messages from, eg. Telegram's
    pub async fn bridged_author(&self, id: BridgedUserId) -> Option<(Author, BridgedUserSummary)> {
        let client = self.user_index_client();
        let response = client.bridged_users(vec![id]).execute_async().await;

        match response {
            Ok(BridgedUsersResponse::Success(users)) => users.into_iter().next().map(|summary| {
                let author = Author {
                    name: bridged_name(&summary.user),
                    avatar_url: bridged_avatar_url(&summary.user),
                };
                (author, summary)
            }),
            Err(error) => {
                warn!(?id, ?error, "Failed to look up bridged user");
                None
            }
        }
    }

    async fn fetch_user(&self, user_id: UserId) -> Result<Option<UserSummary>> {
        let response: UserResponse = with_retries(|| {
            self.runtime.query_canister(
                self.user_index,
                "user_msgpack",
                UserArgs {
                    user_id: Some(user_id),
                    username: None,
                },
            )
        })
        .await?;

        match response {
            UserResponse::Success(user) => Ok(Some(user)),
            UserResponse::UserNotFound => Ok(None),
            UserResponse::Error(error) => Err(oc_error(error)),
        }
    }
}

// The UserIndex's `user` query, which the SDK doesn't have
#[derive(Serialize)]
struct UserArgs {
    user_id: Option<UserId>,
    username: Option<String>,
}

#[derive(Deserialize)]
enum UserResponse {
    Success(UserSummary),
    UserNotFound,
    Error(OCError),
}

#[derive(Deserialize)]
struct UserSummary {
    user_id: UserId,
    username: String,
    display_name: Option<String>,
    avatar_id: Option<u128>,
    #[serde(default)]
    is_bot: bool,
}

pub fn identity_from_pem(pem: &str) -> Result<Box<dyn Identity>> {
    if let Ok(identity) = Secp256k1Identity::from_pem(pem.as_bytes()) {
        Ok(Box::new(identity))
    } else if let Ok(identity) = BasicIdentity::from_pem(pem.as_bytes()) {
        Ok(Box::new(identity))
    } else {
        bail!("The bot's PEM is neither a secp256k1 nor an Ed25519 key")
    }
}

// Retries a call which failed to reach OpenChat, or which the IC rejected as transient. Calls are
// safe to retry, since messages are sent with ids derived from the messages they relay.
async fn with_retries<T, F, Fut>(call: F) -> Result<T>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, CallError>>,
{
    let mut delays = RETRY_DELAYS.iter();
    loop {
        match call().await {
            Ok(response) => return Ok(response),
            Err((code, message)) if is_transient(code, &message) => match delays.next() {
                Some(delay) => {
                    warn!(code, message, "Call to OpenChat failed, retrying");
                    tokio::time::sleep(*delay).await;
                }
                // Not a PermanentFailure, so it's retried later, eg. once an upgrade is done
                None => bail!("Call to OpenChat failed: {code} {message}"),
            },
            Err((code, message)) => {
                return Err(PermanentFailure::Rejected(format!(
                    "Call to OpenChat rejected: {code} {message}"
                ))
                .into());
            }
        }
    }
}

// The call didn't reach OpenChat, the IC rejected it as transient, or a canister was stopped, as
// they are briefly while they're upgraded
fn is_transient(code: i32, message: &str) -> bool {
    code == 0
        || code == 2
        || (code == 5 && (message.contains("is stopped") || message.contains("is stopping")))
}

fn unit_result(response: UnitResult) -> Result<()> {
    match response {
        UnitResult::Success => Ok(()),
        UnitResult::Error(error) => Err(oc_error(error)),
    }
}

// Retrying won't change OpenChat's answer, unless its call to the chat failed, eg. as the chat was
// stopped to be upgraded
fn oc_error(error: OCError) -> anyhow::Error {
    let message = format!("OpenChat returned an error: {error:?}");
    if error.matches_code(OCErrorCode::C2CError) {
        anyhow!(message)
    } else {
        PermanentFailure::Rejected(message).into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_stopped_canister_is_retried_but_a_trap_isnt() {
        assert!(is_transient(0, "connection reset"));
        assert!(is_transient(2, "queue full"));
        assert!(is_transient(5, "Canister abc is stopped"));
        assert!(is_transient(5, "Canister abc is stopping"));
        assert!(!is_transient(5, "Canister abc trapped: unreachable"));
        assert!(!is_transient(4, "rejected"));
    }
}
