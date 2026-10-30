use crate::games::{Change, Games};
use oc_bots_sdk::oc_api::actions::installation_events::BotInstallationEvent;
use oc_bots_sdk::oc_api::actions::{ActionArgsBuilder, installation_events};
use oc_bots_sdk::oc_api::client::{Client, ClientFactory};
use oc_bots_sdk::types::{CanisterId, MiniAppGame, TimestampMillis, UserId};
use oc_bots_sdk_offchain::mini_app::{MiniAppServiceClient, MiniAppVerifier};
use oc_bots_sdk_offchain::{AgentRuntime, env};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::OnceCell;
use tracing::{error, info};

// How long after a deadline the bot looks at the clock, so the flag has fallen by then
const FLAG_MARGIN_MS: u64 = 50;

/// What the command and the routes share: the bot's games, and its clients for OpenChat and the
/// MiniApp service
pub struct Bot {
    pub oc_client_factory: Arc<ClientFactory<AgentRuntime>>,
    pub user_index: Client<AgentRuntime, CanisterId>,
    pub mini_app_service_url: String,
    pub mini_apps: OnceCell<MiniAppServiceClient<AgentRuntime>>,
    pub verifier: OnceCell<MiniAppVerifier>,
    pub games: Games,
}

impl Bot {
    pub fn new(
        oc_client_factory: Arc<ClientFactory<AgentRuntime>>,
        user_index_canister_id: CanisterId,
        mini_app_service_url: String,
    ) -> Self {
        Bot {
            user_index: oc_client_factory.build(user_index_canister_id),
            oc_client_factory,
            mini_app_service_url,
            mini_apps: OnceCell::new(),
            verifier: OnceCell::new(),
            games: Games::default(),
        }
    }

    /// Tells the service about a change to a game, and watches for the next flag
    pub async fn publish(
        self: &Arc<Self>,
        game: MiniAppGame,
        change: Change,
    ) -> Result<(), String> {
        if let Some(deadline) = change.deadline {
            self.arm_clock(game, deadline);
        }
        self.mini_apps()
            .await?
            .update(change.into_update(game))
            .await
            .map_err(|error| format!("The MiniApp service didn't take the update: {error}"))
    }

    /// Shows everyone with the game open who's joined, once the service has the bot's answer. It
    /// can't wait for the service: the service holds the game while it asks the bot about a join,
    /// so an update sent before the answer would wait for the join to time out.
    pub fn publish_lobby(self: &Arc<Self>, game: MiniAppGame) {
        let Some(change) = self.games.lobby(game, env::now()) else {
            return;
        };
        let bot = self.clone();
        tokio::spawn(async move {
            if let Err(error) = bot.publish(game, change).await {
                error!("Failed to send the players of {game:?}: {error}");
            }
        });
    }

    /// Ends the game on time when the side to move's flag falls, unless it moves first. Called
    /// whenever a side's clock starts, so there's a task waiting for each deadline the game has
    /// had; one which wakes to find the game has moved on, or is over, does nothing.
    pub fn arm_clock(self: &Arc<Self>, game: MiniAppGame, deadline: TimestampMillis) {
        let bot = self.clone();
        tokio::spawn(async move {
            let wait = deadline.saturating_sub(env::now()) + FLAG_MARGIN_MS;
            tokio::time::sleep(Duration::from_millis(wait)).await;
            let Some(change) = bot.games.flag(game, env::now()) else {
                return;
            };
            info!("The flag fell in {game:?}");
            if let Err(error) = bot.publish(game, change).await {
                error!("Failed to tell the service the flag fell in {game:?}: {error}");
            }
        });
    }

    /// The service's client, which gets the bot's token from the LocalUserIndex a command came
    /// through, unless it has one already
    pub async fn mini_apps_via(
        &self,
        api_gateway: CanisterId,
    ) -> &MiniAppServiceClient<AgentRuntime> {
        self.mini_apps
            .get_or_init(|| async { self.service_client(api_gateway) })
            .await
    }

    /// The service's client, from a LocalUserIndex the bot's installed on, when the service calls
    /// before any command has, eg. after the bot was restarted
    pub async fn mini_apps(&self) -> Result<&MiniAppServiceClient<AgentRuntime>, String> {
        self.mini_apps
            .get_or_try_init(|| async {
                let (_, api_gateway) = self.installation().await?;
                Ok(self.service_client(api_gateway))
            })
            .await
    }

    /// Verifies the service's tokens, with its public key, fetched once, and the user id OpenChat
    /// gave the bot when it was registered, which isn't its principal
    pub async fn verifier(&self) -> Result<&MiniAppVerifier, String> {
        self.verifier
            .get_or_try_init(|| async {
                let (bot_id, _) = self.installation().await?;
                let public_key = self
                    .mini_apps()
                    .await?
                    .public_key()
                    .await
                    .map_err(|error| {
                        format!("Couldn't fetch the MiniApp service's public key: {error}")
                    })?;
                Ok(MiniAppVerifier::new(public_key, bot_id))
            })
            .await
    }

    fn service_client(&self, api_gateway: CanisterId) -> MiniAppServiceClient<AgentRuntime> {
        MiniAppServiceClient::new(
            &self.mini_app_service_url,
            self.oc_client_factory.build(api_gateway),
        )
    }

    // The bot's id, and the LocalUserIndex of its latest installation, from the UserIndex
    async fn installation(&self) -> Result<(UserId, CanisterId), String> {
        match self
            .user_index
            .installation_events()
            .from(0)
            .size(100)
            .execute_async()
            .await
        {
            Ok(installation_events::Response::Success(result)) => {
                let api_gateway = result
                    .events
                    .iter()
                    .rev()
                    .find_map(|event| match event {
                        BotInstallationEvent::Installed(installed) => Some(installed.api_gateway),
                        BotInstallationEvent::Uninstalled(_) => None,
                    })
                    .ok_or("The bot isn't installed anywhere yet")?;
                Ok((result.bot_id, api_gateway))
            }
            other => Err(format!(
                "Failed to look up the bot. Has it been registered? {other:?}"
            )),
        }
    }
}
