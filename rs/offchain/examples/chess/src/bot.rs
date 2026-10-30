use crate::games::{Change, Games};
use oc_bots_sdk::oc_api::actions::installation_events::BotInstallationEvent;
use oc_bots_sdk::oc_api::actions::{ActionArgsBuilder, installation_events};
use oc_bots_sdk::oc_api::client::{Client, ClientFactory};
use oc_bots_sdk::types::{CanisterId, MiniAppGame, TimestampMillis, UserId};
use oc_bots_sdk_offchain::mini_app::{
    GameUpdate, MiniAppServiceClient, MiniAppServiceError, MiniAppVerifier,
};
use oc_bots_sdk_offchain::{AgentRuntime, env};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::OnceCell;
use tracing::{error, info, warn};

// How long after a deadline the bot looks at the clock, so the flag has fallen by then
const FLAG_MARGIN_MS: u64 = 50;
// How long to wait before each try at sending a game's latest state again, after the service
// didn't take an update, after which the bot gives up on it: the service ends a game it hears
// nothing about for a day
const RETRY_DELAYS: [Duration; 5] = [
    Duration::from_secs(2),
    Duration::from_secs(5),
    Duration::from_secs(15),
    Duration::from_secs(60),
    Duration::from_secs(300),
];
// How often games which are over, or never started, are forgotten
const PRUNE_INTERVAL: Duration = Duration::from_secs(10 * 60);

/// What the command and the routes share: the bot's games, and its clients for OpenChat and the
/// MiniApp service
pub struct Bot {
    pub oc_client_factory: Arc<ClientFactory<AgentRuntime>>,
    pub user_index: Client<AgentRuntime, CanisterId>,
    pub mini_app_service_url: String,
    pub mini_apps: OnceCell<MiniAppServiceClient<AgentRuntime>>,
    pub verifier: OnceCell<MiniAppVerifier>,
    pub games: Games,
    /// The games whose latest state is waiting to be sent again
    retrying: Mutex<HashSet<MiniAppGame>>,
}

// Why an update didn't reach the service
enum SendError {
    /// The service couldn't be reached, or couldn't take it for now, so it's worth trying again
    Transient(String),
    /// The service refused it, which trying again won't change
    Refused(String),
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
            retrying: Mutex::new(HashSet::new()),
        }
    }

    /// Tells the service about a change to a game, and watches for the next flag. If the service
    /// couldn't take it for now, the game's latest state is sent again later, so the change
    /// stands: the states are idempotent, by their seq. An update the service refuses outright is
    /// an error.
    pub async fn publish(
        self: &Arc<Self>,
        game: MiniAppGame,
        change: Change,
    ) -> Result<(), String> {
        if let Some(deadline) = change.deadline {
            self.arm_clock(game, deadline);
        }
        match self.send(change.into_update(game)).await {
            Ok(()) => Ok(()),
            Err(SendError::Transient(reason)) => {
                warn!(
                    "The MiniApp service didn't take an update for {game:?}, trying again later: {reason}"
                );
                self.retry_later(game);
                Ok(())
            }
            Err(SendError::Refused(reason)) => Err(reason),
        }
    }

    /// Publishes a change once the call this is made from has answered. The service holds a game
    /// while it asks the bot about it, eg. a join, so an update sent before the answer would wait
    /// for the call to time out.
    pub fn publish_in_background(self: &Arc<Self>, game: MiniAppGame, change: Change) {
        let bot = self.clone();
        tokio::spawn(async move {
            if let Err(error) = bot.publish(game, change).await {
                error!("Failed to publish a change to {game:?}: {error}");
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

    /// Forgets old games now and then
    pub fn prune_games(self: &Arc<Self>) {
        let bot = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(PRUNE_INTERVAL).await;
                bot.games.prune(env::now());
            }
        });
    }

    // Sends the game's latest state again, after a while, and again if that doesn't get through
    // either; one such chain per game
    fn retry_later(self: &Arc<Self>, game: MiniAppGame) {
        if self.retrying.lock().unwrap().insert(game) {
            self.retry(game, 0);
        }
    }

    fn retry(self: &Arc<Self>, game: MiniAppGame, attempt: usize) {
        let Some(delay) = RETRY_DELAYS.get(attempt) else {
            error!("Gave up sending the latest state of {game:?}");
            self.retrying.lock().unwrap().remove(&game);
            return;
        };
        let bot = self.clone();
        let delay = *delay;
        tokio::spawn(async move {
            tokio::time::sleep(delay).await;
            let Some(change) = bot.games.latest(game, env::now()) else {
                bot.retrying.lock().unwrap().remove(&game);
                return;
            };
            match bot.send(change.into_update(game)).await {
                Ok(()) => {
                    info!("Sent the latest state of {game:?}");
                    bot.retrying.lock().unwrap().remove(&game);
                }
                Err(SendError::Transient(reason)) => {
                    warn!(
                        "The MiniApp service still didn't take the latest state of {game:?}: {reason}"
                    );
                    bot.retry(game, attempt + 1);
                }
                Err(SendError::Refused(reason)) => {
                    error!("The MiniApp service refused the latest state of {game:?}: {reason}");
                    bot.retrying.lock().unwrap().remove(&game);
                }
            }
        });
    }

    async fn send(&self, update: GameUpdate) -> Result<(), SendError> {
        let mini_apps = self.mini_apps().await.map_err(SendError::Transient)?;
        mini_apps.update(update).await.map_err(|error| match error {
            MiniAppServiceError::Status(..)
            | MiniAppServiceError::Request(_)
            | MiniAppServiceError::BotToken(_) => SendError::Transient(error.to_string()),
            MiniAppServiceError::Invalid(_)
            | MiniAppServiceError::Unauthorized(_)
            | MiniAppServiceError::NotTheBotsGame(_)
            | MiniAppServiceError::UnknownGame(_)
            | MiniAppServiceError::Finished(_)
            | MiniAppServiceError::TooLarge(_) => {
                SendError::Refused(format!("The MiniApp service refused the update: {error}"))
            }
        })
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
