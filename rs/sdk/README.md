# SDK for bots built in Rust

## Overview

Bots are server components that can interact with OpenChat, typically by sending messages, within particular _scopes_ (communities/channels/groups/direct chats) into which they are installed.

At a minimum, in order to be registered on OpenChat, bots must return a `bot definition` in response to an HTTP GET to the path `/bot_definition`.

Within the SDK is an `api` folder which reflects the [Bot API](#bot-api) which bots provide to the OpenChat frontend, and an `oc_api` folder which reflects the [OpenChat API](#openchat-api) the OpenChat backend provides to bots.

## Bot API

The Bot API defines the [bot definition](#bot-definition) which when serialised as JSON conforms to the [Bot definition _schema_](<(../../schema/bot_schema.json)>).

It also provides a [command handler registry](#command-handler-registry) which simplifies the process of digesting JWTs to handle commands, and an action handler registry which does the same for [presses of buttons](#button-presses) on the bot's [MiniApp messages](#miniapp-messages).

### Bot definition

```
pub struct BotDefinition {
    pub description: String,
    pub commands: Vec<BotCommandDefinition>,
    pub autonomous_config: Option<AutonomousConfig>,
    pub default_subscriptions: Option<BotSubscriptions>,
    pub restricted_locations: Option<HashSet<InstallationLocationType>>,
}
```

Let's do a deep dive...

The first thing to notice is that it _doesn't_ contain the bot's `name`. This is because the bot name must be unique within OpenChat and so a name is chosen when the bot is registered.

It _does_ include the `description` of the bot which is shown in the OpenChat UI in various places associated with the bot.

It also defines a list of [commands](#commands).

Next, the bot definition specifies an optional [autonomous_config](#autonomous-configuration).

Finally, `default_subscriptions` lists the chat and community events the bot would like OpenChat to notify it of, and `restricted_locations` limits where it can be installed, eg. only in groups.

#### Commands

When a bot is installed in a particular _location_ (community/group/direct chat), users within this location can issue commands by typing '/' in the message input. This pops up a list of available commands aggregated across all bots installed in this location. In the message entry, users continue typing to filter the list of commands until they have found the desired command.

```
pub struct BotCommandDefinition {
    pub name: String,
    pub description: Option<String>,
    pub placeholder: Option<String>,
    pub params: Vec<BotCommandParam>,
    pub permissions: BotPermissions,
    pub default_role: Option<ChatRole>,
    pub direct_messages: Option<bool>,
}
```

Each command has a `name` and optional `description` which are self explanatory.

The optional `placeholder` is a temporary message shown in the chat panel when the OpenChat app is waiting for a response from the bot. If this is left undefined then the message just shows "...".

Next, are the list of `params` the command takes which could be empty.

```
pub struct BotCommandParam {
    pub name: String,
    pub description: Option<String>,
    pub placeholder: Option<String>,
    pub required: bool,
    pub param_type: BotCommandParamType,
}
```

When a user types a `/command` they can either select it from the popup, in which case if there are command parameters defined, a dialog box will be shown with appropriate UI input widgets for each type of parameter. Or, the user can fully type the `/command` and keep typing any parameter values (aka arguments) into the message entry field, in which case OpenChat will validate the inputs to ensure they conform to the parameter definitions. Each parameter has a `name` and optional `description`. It has an optional `placeholder` which is shown in the parameter input widget as a guide to the user. It also has a flag to indicate whether this is a `required` parameter. If not the user can leave it empty and the bot will use a default value. Finally the `param_type` is specified.

```
pub enum BotCommandParamType {
    BooleanParam,
    StringParam(StringParam),
    IntegerParam(IntegerParam),
    DecimalParam(DecimalParam),
    DateTimeParam(DateTimeParam),
    UserParam,
}
```

A parameter can be either a boolean, a string, an integer, a decimal, a datetime, or an open chat user id. In the case of strings, integers and decimals, the range of possible inputs can be specified and a list of possible `choices` provided. If `choices` are specified, then OpenChat will show a drop down list for this parameter with the possible options.

Next up, are the command [permissions](#bot-permissions). This is the set of permissions the bot requires to take action(s) within OpenChat when this command is executed. For simplicity, the `BotPermissions` type includes permissions for all types of OpenChat action, whether at community, chat, or message scope regardless of whether this makes sense when used in a particular context. For instance, commands can currently only be issued within chats so community permissions like `CreatePrivateChannel`, don't apply, whereas they _do_ make sense for a bot acting autonomously in a community. When the owner of a particular location (community/group/direct chat) installs a bot, they can choose which permissions to grant to the bot and this will determine which commands are available for use within this location.

Next, the command has an optional `default_role`. This can be either `Owner`, `Admin`, `Moderator` or `Participant` and defaults to the latter if none is specified. This is a hint to OpenChat to use this default when asking the bot installer which roles should be able to call this command. In fact, at the time of writing, OpenChat does _not_ ask the installer which roles can call each command, and so `default_role` actually allows the bot developer to specify which roles should be able to call this command. Roles are hierarchical, so for instance, if the `default_role` is `Admin` this means it can be called by all members with the `Admin` or `Owner` role.

Finally, commands have a `direct_messages` flag, indicating to OpenChat that this command supports "direct messages". This only applies when a bot is installed as a direct chat. In this case, if free text is entered in the message box rather than a `/command`, OpenChat will implicitly send this command to the bot, and will split the user text and bot response into two separate messages. This allows the user to interact in a conversational style particularly appropriate for AI bots. To be eligible, the first parameter of the command must be a string and it can have no other required parameters. Logically, only one command should have `direct_messages` set to true but in case there are multiple, OpenChat will simply pick the first one.

#### Autonomous configuration

In addition to acting in response to user commands, bots can take actions autonomously.

```
pub struct AutonomousConfig {
    pub permissions: BotPermissions,
}
```

The optional `AutonomousConfig` tells OpenChat which permissions the bot would like in order to take autonomous actions. When a bot is installed, the installer chooses which of these permissions to grant it in that location, and OpenChat notifies the bot, at `/notify`, with a `BotInstalledEvent` giving the location and the permissions granted. The bot keeps each installation's `api_gateway`, eg. in an [InstallationRegistry](./src/installation_registry.rs), and acts in the location with a client built from an `AutonomousContext`:

```
let client = oc_client_factory.build(AutonomousContext {
    api_gateway: record.api_gateway,
    scope: ActionScope::Chat(chat),
});
```

A bot can also let a 3rd party act through it, say a GitHub action which has the bot send a message whenever a PR is created, by giving it an API key for a location. The bot issues and checks its own keys, eg. with an [ApiKeyRegistry](./src/api_key_registry.rs), as the [GreetBot](../canister/examples/greet/canister/src/router/commands/generate_api_key.rs) does with its `/generate_api_key` command.

It is worth clarifying the different between _location_ and _scope_. The bot can be _installed_ into a _location_ which is either a community, group or direct chat. However, a bot can _act_ in a _scope_ which is ether a community, _channel_, group or direct chat. For groups and direct chats, location and scope are the same thing. Bots can be installed into communities but _not_ channels, and the permissions granted in a community cascade to all its channels.

#### Bot permissions

```
pub struct BotPermissions {
    community: u32,
    chat: u32,
    message: u32,
}
```

This struct bit encodes the permissions which otherwise can take considerable space when serialised, such as in JWTs. However, it provides an interface which allows you to consider it as a set of community permissions, a set of chat permissions and a set of message permissions - defined below.

```
pub enum CommunityPermission {
    ChangeRoles,
    UpdateDetails,
    InviteUsers,
    RemoveMembers,
    CreatePublicChannel,
    CreatePrivateChannel,
    ManageUserGroups,
    ReadMembership,
    ReadSummary,
}

pub enum ChatPermission {
    ChangeRoles,
    UpdateGroup,
    AddMembers,
    InviteUsers,
    RemoveMembers,
    DeleteMessages,
    PinMessages,
    ReactToMessages,
    MentionAllMembers,
    StartVideoCall,
    ReadMessages,
    ReadMembership,
    ReadSummary,
}

pub enum MessagePermission {
    Text,
    Image,
    Video,
    Audio,
    File,
    Poll,
    Crypto,
    Giphy,
    Prize,
    P2pSwap,
    VideoCall,
    MiniApp,
}
```

### Command Handler Registry

In addition to providing the bot definition, the api folder contains a [CommandHandlerRegistry](./src/api/command/command_handler.rs).

Here is an example from the [ReminderBot](../canister/examples/reminder/src/router/commands.rs) of the `CommandHandlerRegistry` being initialised:

```
    CommandHandlerRegistry::new(OPENCHAT_CLIENT_FACTORY.clone())
        .register(RemindRecurring)
        .register(RemindAt)
        .register(List)
        .register(Delete)
```

In this case four command handlers are registered. Each command handler implements the [CommandHandler](./src/api/command/command_handler.rs) trait:

```
pub trait CommandHandler<R>: Send + Sync {
    fn definition(&self) -> &BotCommandDefinition;

    async fn execute(
        &self,
        oc_client: Client<R, BotCommandContext>,
    ) -> Result<SuccessResult, String>;

    ...
}
```

Each command handler implements its portion of the [BotDefinition](#bot-definition) and an `execute` function where all the action happens! The execute function is passed an `oc_client` for calling into OpenChat, which we'll cover in the [OpenChat API section](#openchat-api), whose `context()` is the command's context, including its arguments, extracted from the JWT.

## OpenChat API

TBD


## Link previews (og_previews)

OpenChat messages can carry OpenGraph link previews - the title/description/image card you see
under a link. OpenChat does not scrape links itself, it just stores whatever the sender gives it,
so bots have to supply them.

`SendMessageBuilder::with_og_previews` sets them explicitly:

```rust
client
    .send_text_message("check this out https://example.com".to_string())
    .with_og_previews(vec![OgPreview {
        url: "https://example.com".to_string(),
        title: "Example".to_string(),
        description: "An example".to_string(),
        image: None,
    }])
    .execute_then_return_message(|_, _| ());
```

The field is tri-state:

| `with_og_previews` | behaviour |
| --- | --- |
| not called | the runtime decides - see below |
| called with a non-empty list | that list is sent as-is, nothing is fetched |
| called with an empty list | no previews are sent, nothing is fetched |

Anything you set explicitly always wins.

Note this tri-state is **client-side only**. OpenChat collapses an absent field and an empty list
to the same thing (`og_previews.unwrap_or_default()`), so on the wire "unset" and "empty" are
identical - both mean no previews. The difference is purely in what this SDK does before sending.

### Automatic lookup differs by runtime

| runtime | automatic lookup | explicit previews |
| --- | --- | --- |
| `oc_bots_sdk_offchain` (`AgentRuntime`) | yes | yes |
| `oc_bots_sdk_canister` (`CanisterRuntime`) | no | yes |

In-canister bots are pass-through only on purpose. Scraping a link from a canister means an http
outcall replicated across the subnet and a cycles cost on the send path, which is not a reasonable
thing to do every time a bot posts a link.

Offchain, whenever you send a **text** message the runtime extracts up to three links from the
text and fetches previews before the call goes out. Markdown links (`[title](https://...)`) are
unwrapped first, and links to OpenChat messages are skipped because the OpenChat client renders
those itself. If the message is not a text message, or contains no links, no http calls are made.

A preview lookup can never stop a message being sent. Requests are made concurrently with a five
second timeout and every failure degrades to fewer previews, never to a send failure. Results are
cached by url for ten minutes (failures for thirty seconds), up to 500 entries, and in-flight
requests for the same url are shared, so fanning the same message out to many chats only asks the
preview service once.

### Message ordering

The preview lookup happens on the send path, so a send that carries links now takes longer to
reach the canister than one that does not. If you issue two sends concurrently (or use `execute`,
which spawns and returns immediately), a link-free message will very likely arrive **before** a
message containing links, because the latter blocks on up to three lookups first. If ordering
matters, `await` each `execute_async` before issuing the next.

Because results are cached, this only bites on the first send of a given set of urls - repeat
sends of the same links resolve from cache and are fast.

To configure or disable it, build the runtime with an `OgPreviewConfig`:

```rust
use oc_bots_sdk_offchain::{AgentRuntime, OgPreviewConfig};

let runtime = AgentRuntime::new_with_og_preview_config(
    agent,
    tokio_runtime,
    OgPreviewConfig {
        auto_fetch: false, // defaults to true
        proxy_url: "https://my-preview-service".to_string(),
    },
);
```

## Images

An image message shows a file in OpenChat's own storage, which it refers to by a `BlobReference`.
`Client::upload_image` uploads the image there, as the bot, and returns the message's content, with
the image's size and a thumbnail:

```rust
use oc_bots_sdk::mainnet::mainnet_storage_index_canister_id;

let mut image = client
    .upload_image(mainnet_storage_index_canister_id(), png, image::ImageFormat::Png)
    .await?;
image.caption = Some("A caption".to_string());

client
    .send_message(MessageContentInitial::Image(image))
    .execute_async()
    .await;
```

- Only PNGs can be read, for now.
- `Client::upload_blob` uploads any other file and returns its `BlobReference`.
- A file is uploaded in chunks of the size OpenChat's storage gives, up to 5 at once. Each chunk is
  tried up to 3 times, and the first to fail stops the upload.
- The chat the client acts in is recorded as the file's accessor, and OpenChat deletes a group's
  or community's files along with it, so upload with the client you'll send the message with.
- Uploads count against the bot's allowance of 1 GB, which OpenChat gives it when it's registered.
- The bot needs permission to send image messages.

## MiniApp messages

A MiniApp message is markdown text with up to 5 rows of buttons, which a bot posts and keeps up to
date while something it runs goes on, eg. a game's lobby, then its board. When a member of the chat
presses a button, the OpenChat website sends the press to the bot, which acts on it and edits the
message to show what changed. The bot keeps all the state, eg. the game's: OpenChat only stores the
message.

```rust
let content = MiniAppContent {
    text: "**Tic-tac-toe** · @UserId(..)'s turn".to_string(),
    button_rows: vec![vec![MessageButton {
        id: "cell-4".to_string(),
        label: "·".to_string(),
        style: MessageButtonStyle::Secondary,
        // Everyone, or eg. `Some(vec![host])` to show it only to the host
        visible_to: None,
    }]],
};
content.validate()?;

client
    .send_message(MessageContentInitial::MiniApp(content))
    .execute_async()
    .await;
```

- Only bots can send them, and they need `MessagePermission::MiniApp` to, eg. in a command's
  `permissions`. They can't be forwarded, and can't be sent in direct chats for now.
- `@UserId(<id>)` in the text is shown as the user's name.
- `visible_to` only hides a button, so the bot still checks who may press it.
- OpenChat refuses content beyond the limits on `MiniAppContent` (eg. 2,000 characters of text,
  5 buttons a row, ids of up to 64 bytes, each unique within the message). `validate` checks them,
  so that a mistake shows up before the message is sent.

### Button presses

The website POSTs each press to the bot's endpoint at `/execute_action`, with the user's
[session token](#the-session-token) in the `x-oc-jwt` header and the button's id as the body:

```
POST /execute_action
Content-Type: application/json
x-oc-jwt: <BotMessageSession JWT>

{"button_id": "cell-4"}
```

An [ActionHandlerRegistry](./src/api/action/action_handler.rs) verifies the token, then gives the
press to the first registered [ActionHandler](./src/api/action/action_handler.rs) which `handles`
the button, every button by default. The handler gets a `ButtonPress`, with the session (the user,
chat, thread, message id and the user's timezone and language), the `button_id`, and a client for
the chat, and answers with an `ActionResponse`:

| `ActionResponse` | status | body |
| --- | --- | --- |
| `Success` | 200 | `{ "message"?: { "content": <MessageContentInitial>, "block_level_markdown"?: bool } }` |
| `BadRequest` | 400 | the reason, as text, eg. for a button which isn't valid now |
| `Unauthorized` | 401 | the reason, as text. The token is invalid or has expired, so the website fetches a new one and tries once more. |
| `TooManyRequests` | 429 | none |
| `InternalError` | 500 | the reason, as text |

A successful response's `message`, usually text, is shown to the user who pressed the button and no
one else, like a command's ephemeral reply, eg. `ActionResponse::reply("It's not your turn")`.

```rust
struct TicTacToe;

#[async_trait]
impl<R: Runtime> ActionHandler<R> for TicTacToe {
    fn handles(&self, button_id: &str) -> bool {
        button_id.starts_with("cell-")
    }

    async fn execute(&self, press: ButtonPress<R>) -> ActionResponse {
        // Look the game up by the session's chat, thread and message id together, as a message id
        // is only unique within its chat and thread. Check it's `press.user_id()`'s turn and make
        // the move, then show it.
        let session = &press.session;
        let game = games.get(&(session.chat, session.thread, session.message_id));
        let board = game.render();

        match press.edit_message(board).execute_async().await {
            Ok(UnitResult::Success) => ActionResponse::ok(),
            other => ActionResponse::internal_error(format!("{other:?}")),
        }
    }
}
```

Tokens are only accepted for the bot's own id, which is the user id OpenChat gave it when it was
registered, not its principal.

In a canister bot, route `/execute_action` to the canister SDK's `http_action_handler`, which takes
the token from the header. Pass it the bot's id, which the canister is told in the
`BotLifecycleEvent::Registered` notification, or by `installation_events::load`, as the
[ModeratorBot](../canister/examples/moderator/src/installations.rs) does:

```rust
static ACTIONS: LazyLock<ActionHandlerRegistry<CanisterRuntime>> =
    LazyLock::new(|| ActionHandlerRegistry::new(OPENCHAT_CLIENT_FACTORY.clone()).register(TicTacToe));

HttpRouter::default()
    .route("/execute_command", POST, commands::execute)
    .route("/execute_action", POST, actions::execute)

// actions::execute
pub async fn execute(request: HttpRequest) -> HttpResponse {
    let (public_key, bot_id) = state::read(|state| (state.oc_public_key().to_string(), state.bot_id));
    let Some(bot_id) = bot_id else {
        return HttpResponse::text(500, "The bot hasn't been told its id yet");
    };
    http_action_handler::execute(request, &ACTIONS, &public_key, bot_id, now()).await
}
```

Offchain, `ExtractJwtLayer` takes the token from the header for `/execute_action` as it does for
`/execute_command`, refusing a request without one with a 401. Pass the registry the body and the
bot's id, and send the `ActionResponse::into_http` it gives back. An offchain bot can fetch its id
from the UserIndex, as `client.installation_events().size(0)` gives it as `bot_id`. Fetch it when
the first press arrives, rather than at startup, as a bot is usually started before it's
registered.

### The session token

The website fetches a `BotMessageSession` token for each user and MiniApp message, and sends it with
every button they press there. OpenChat signs it, with the key it signs command JWTs with, once it
has checked the user is a member of the chat and the message is the bot's. It's valid for 15
minutes. The website reuses it for each press until then, and fetches a new one, then tries once
more, when the bot answers a press with a 401. Its claims are:

```
pub struct BotMessageSessionClaims {
    pub bot_api_gateway: CanisterId,
    pub bot: UserId,
    pub chat: Chat,
    pub thread: Option<MessageIndex>,
    pub message_id: MessageId,
    pub user_id: UserId,
    pub meta: Option<CommandMeta>,
}
```

`BotMessageSession::parse(jwt, oc_public_key, bot_id, now)`, which the registry calls, checks the
signature, that the token is a `BotMessageSession` token, for this bot, and hasn't expired
(`TokenError::Expired`). Checking the bot matters: otherwise one bot's server could replay a user's
token to another bot.

The token only vouches for the user. OpenChat's bot endpoints don't accept it, so a bot acts on a
press autonomously: `ButtonPress::client` acts in the chat through the token's `bot_api_gateway`,
and `ButtonPress::edit_message` edits the message the button is on, in its thread. The bot needs
the autonomous `MessagePermission::MiniApp` permission to edit it, so declare it in the definition's
`autonomous_config`.

### Lobbies

[`games::Lobby`](./src/games.rs) gathers players for a game: its host, who posted it, is its first
player, others join and leave, and the host starts the game once enough have joined. `join`, `leave`
and `start` return a `LobbyError` (eg. `Full`, `NotAPlayer`, `NotTheHost`, `TooFewPlayers`,
`AlreadyStarted`), worded for the player, for an `ActionResponse::reply`. `render(title)` gives the
lobby's message: its players, mentioned by `@UserId`, with Join and Leave buttons for everyone, and
a Start button only the host is shown.

```rust
let mut lobby = Lobby::new(host, 2, 2);
let content = lobby.render("Tic-tac-toe");

// On a press of `Lobby::JOIN`
if let Err(error) = lobby.join(press.user_id()) {
    return ActionResponse::reply(error.to_string());
}
press.edit_message(lobby.render("Tic-tac-toe")).execute_async().await;
```

### No wagering

Games must never involve wagering tokens, or anything else of value, eg. a stake to join or a prize
paid from the players' stakes. That's gambling, which OpenChat isn't licensed for.
