# SDK for bots built in Rust

## Overview

Bots are server components that can interact with OpenChat, typically by sending messages, within particular _scopes_ (communities/channels/groups/direct chats) into which they are installed.

At a minimum, in order to be registered on OpenChat, bots must return a `bot definition` in response to an HTTP GET to the path `/bot_definition`.

Within the SDK is an `api` folder which reflects the [Bot API](#bot-api) which bots provide to the OpenChat frontend, and an `oc_api` folder which reflects the [OpenChat API](#openchat-api) the OpenChat backend provides to bots.

## Bot API

The Bot API defines the [bot definition](#bot-definition) which when serialised as JSON conforms to the [Bot definition _schema_](<(../../schema/bot_schema.json)>).

It also provides a [command handler registry](#command-handler-registry) which simplifies the process of digesting JWTs to handle commands.

### Bot definition

```
pub struct BotDefinition {
    pub description: String,
    pub commands: Vec<BotCommandDefinition>,
    pub autonomous_config: Option<AutonomousConfig>,
}
```

Let's do a deep dive...

The first thing to notice is that it _doesn't_ contain the bot's `name`. This is because the bot name must be unique within OpenChat and so a name is chosen when the bot is registered.

It _does_ include the `description` of the bot which is shown in the OpenChat UI in various places associated with the bot.

It also defines a list of [commands](#commands).

Finally, the bot definition specifies an optional [autonomous_config](#autonomous-configuration).

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
    pub direct_messages: bool,
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

Next up, are the command [permissions](#bot-permissions). This is the set of permissions the bot requires to take action(s) within OpenChat when this command is executed. For simplicity, the `BotPermissions` type includes permissions for all types of OpenChat action, whether at community, chat, or message scope regardless of whether this makes sense when used in a particular context. For instance, commands can currently only be issued within chats so community permissions like `CreatePrivateChannel`, don't apply, whereas they _do_ make sense for a bot acting with a community scoped API key. When the owner of a particular location (community/group/direct chat) installs a bot, they can choose which permissions to grant to the bot and this will determine which commands are available for use within this location.

Next, the command has an optional `default_role`. This can be either `Owner`, `Admin`, `Moderator` or `Participant` and defaults to the latter if none is specified. This is a hint to OpenChat to use this default when asking the bot installer which roles should be able to call this command. In fact, at the time of writing, OpenChat does _not_ ask the installer which roles can call each command, and so `default_role` actually allows the bot developer to specify which roles should be able to call this command. Roles are hierarchical, so for instance, if the `default_role` is `Admin` this means it can be called by all members with the `Admin` or `Owner` role.

Finally, commands have a `direct_messages` flag, indicating to OpenChat that this command supports "direct messages". This only applies when a bot is installed as a direct chat. In this case, if free text is entered in the message box rather than a `/command`, OpenChat will implicitly send this command to the bot, and will split the user text and bot response into two separate messages. This allows the user to interact in a conversational style particularly appropriate for AI bots. To be eligible, the first parameter of the command must be a string and it can have no other required parameters. Logically, only one command should have `direct_messages` set to true but in case there are multiple, OpenChat will simply pick the first one.

#### Autonomous configuration

In addition to acting in response to user commands, bots can take actions autonomously.

```
pub struct AutonomousConfig {
    pub permissions: BotPermissions,
    pub sync_api_key: bool,
}
```

The optional `AutonomousConfig` tells OpenChat which permissions the bot would like in order to take autonomous actions. When a bot is installed, the user can choose which of these permissions to grant the bot within this scope. The installer can then generate an API key for the bot in this scope. The installer can give this API key to a 3rd party to enable a particular integration, say to a github action which calls the bot to send a message whenever a PR is created. Or if the `sync_api_key` flag is set, the UI will show a triangular "sync API key" button which will send the API key directly to the bot. In response the bot should store it in a map of scope to API key so it can subsequently take the permitted autonomous actions within these scopes. A map, [ApiKeyRegistry](./src/api_key_registry.rs), is provided by the SDK for this purpose.

It is worth clarifying the different between _location_ and _scope_. The bot can be _installed_ into a _location_ which is either a community, group or direct chat. However, a bot can _act_ in a _scope_ which is ether a community, _channel_, group or direct chat. For groups and direct chats, location and scope are the same thing. Bots can be installed into communities but _not_ channels. However, API keys can be generated at the community scope, in which case the permissions cascade to all channels, or at the channel scope, in which case the API key can only be used with that specific channel.

#### Bot permissions

```
pub struct BotPermissions {
    community: u32,
    chat: u32,
    message: u32,
}
```

This struct bit encodes the permissions which otherwise can take considerable space when serialised, such as in JWTs or API keys. However, it provides an interface which allows you to consider it as a set of community permissions, a set of chat permissions and a set of message permissions - defined below.

```
pub enum CommunityPermission {
    ChangeRoles,
    UpdateDetails,
    InviteUsers,
    RemoveMembers,
    CreatePublicChannel,
    CreatePrivateChannel,
    ManageUserGroups,
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
    ReadChatSummary,
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
        .on_sync_api_key(Box::new(sync_api_key::callback))
```

In this case four command handlers are registered and a separate handler is provided for receiving API keys from OpenChat. Each command handler implements the [CommandHandler](./src/api/command/command_handler.rs#108) trait:

```
pub trait CommandHandler<R>: Send + Sync {
    fn definition(&self) -> &BotCommandDefinition;

    async fn execute(
        &self,
        context: BotCommandContext,
        oc_client_factory: &ClientFactory<R>,
    ) -> Result<SuccessResult, String>;

    ...
}
```

Each command handler implements it's portion of the [BotDefinition](#bot-definition) and an `execute` function where all the action happens! The execute function is passed a `context` with the command context, including its arguments, extracted from the JWT, and a reference to an `oc_client_factory` used to call into OpenChat which we'll cover in the [OpenChat API section](#openchat-api).

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

## MiniApp cards

A bot can host a game, or another app, which people open from a card the bot posts in a group or
channel. OpenChat draws the card: its markdown text, an optional image, the players, whose turn it
is or the result, and buttons to join, leave and open the game. The game itself is the bot's own
web page, which OpenChat shows in a sandboxed frame.

OpenChat's MiniApp service sits between the website and the bot. It posts the card for the bot, so
that a card exists only for a game it knows. Only it records who joins, asking the bot to accept
each player, and only it writes the card's status, from what the bot tells it. A player starts the
game through the service too, and the bot decides who it starts with. A bot can take players off a
game, but never put them on. The service's API is HTTPS, so the offchain SDK's `mini_app` module
has its client. The whole protocol is in OpenChat's `backend/docs/mini_app_service_protocol.md`.

### 1. Posting a card

The bot gets a post token from the LocalUserIndex, in the context it would send a message with, and
hands it to the service with the card. The service posts the card as the bot and records its game,
together, and gives the `MiniAppGame` it names the game by: the card's chat, thread and message id.

```rust
let card = MiniAppContent::new("**Uno** · 2 to 4 players")
    .with_max_players(4)
    // Whether people who aren't playing can watch
    .with_spectators(true);

// Any LocalUserIndex gives the bot its token for the service, eg. the command's `api_gateway`
let mini_apps = MiniAppServiceClient::new(service_url, oc_client_factory.build(api_gateway));

// A command's card is the command's message; an autonomous one goes in the client's chat
let token = match client.mini_app_post_token().execute_async().await {
    Ok(mini_app_post_token::Response::Success(token)) => token,
    other => return Err(format!("{other:?}").into()),
};
let game = mini_apps.post(&token, card, false, None).await?;
```

- The bot needs `MessagePermission::MiniApp`, eg. in the command's `permissions`, and must be
  installed in the chat.
- `send_message` refuses a card: the service is the only way to post one. A card can't be posted in
  a direct chat, nor forwarded or edited, so set the definition's `restricted_locations` to
  communities and groups.
- `mini_app_post_token` takes the setters `send_message` does: `in_channel` for a command in a
  community, `in_thread`, and `with_message_id` for an id the bot chooses for a card it posts
  autonomously. Left to OpenChat, it picks one. The token fixes the message id, and lasts an hour.
- Posting the same token again posts nothing new, and gives the game. So after a timeout, or a 503
  as the service couldn't reach OpenChat, post the same token again. Until the service has posted
  the card, no one can join the game, and `update` answers `UnknownGame`.
- `MiniAppGame::from_post_token` gives the game from the token before the card's posted, eg. to
  have it ready for a join which arrives before the service's answer does.
- `MiniAppContent::validate` checks the card as OpenChat does, with its errors: it's open, its text
  has 1 to 2,000 characters, and `max_players` is 1 to 100.

A card can have an image above its text, eg. the game's artwork. Upload it to OpenChat's storage
first, so that it's scanned like any image and deleted with the card: `Client::upload_mini_app_image`
reads a PNG's size, and `upload_mini_app_image_of_size` takes any image with the size you give.
Upload it for each card, rather than reusing one upload, as deleting a card deletes its image.

```rust
let image = client
    .upload_mini_app_image(mainnet_storage_index_canister_id(), png, image::ImageFormat::Png)
    .await?;
let card = MiniAppContent::new("**Uno** · 2 to 4 players").with_image(image);
```

The client gets the bot's token with `Client::mini_app_token`, keeps it for its hour, and gets a new
one when it's about to expire or the service refuses it.

### 2. Answering join and leave

The service calls the bot at `POST <endpoint>/mini_app/join` and `/mini_app/leave`, with no body
and a token in `x-oc-jwt`, which `ExtractJwtLayer` takes. A `MiniAppVerifier` checks it, with the
service's public key and the bot's user id, and gives the user and the game:

```rust
let verifier = MiniAppVerifier::new(mini_apps.public_key().await?, bot_id);

// POST /mini_app/join, answered within 5 seconds
let claims = verifier.join(&jwt)?;
let answer = if seats_left(&claims.game) {
    JoinResponse::accept()
} else {
    JoinResponse::refuse("Seats are taken")
};

// POST /mini_app/leave: take `claims.user_id` off the game, and answer 200 even if they weren't on it
let claims = verifier.leave(&jwt)?;
```

- `bot_id` is the user id OpenChat gave the bot when it was registered, not its principal: fetch it
  with `installation_events().size(0)` on the UserIndex.
- Answer 200 whether the bot accepts or refuses. Any other status counts as the bot being
  unavailable, and the user isn't shown its message.
- The user isn't a player until the service adds them, after the bot answers. So don't count them
  as playing until the bot's asked to start the game, which may come while it's still answering
  their join.
- If the service can't add a player the bot accepted, as the game started or filled up meanwhile,
  it tells the bot they left.

### 3. Starting the game

A player asks to start the game, eg. with a Start button in the app, and the service calls the bot
at `POST <endpoint>/mini_app/start`, with a token in `x-oc-jwt`. The bot starts it, or refuses:

```rust
// POST /mini_app/start, answered within 5 seconds
let claims = verifier.start(&jwt)?;
let answer = if players.len() >= 2 {
    // `seq` is above any state the bot has already sent, eg. a lobby's
    StartResponse::accept(players, vec![first], GameState { seq, shared, private })
} else {
    StartResponse::refuse("Needs 2 players")
};
```

- The players are who the game starts with, in any order. Each should be playing, or have a join
  the bot accepted and is still answering, which then succeeds. Anyone else isn't added, and the
  bot's told they left, eg. a player whose leave hadn't reached it yet. Anyone playing whom the bot
  leaves out is taken off.
- The state's `seq` must be above any state the bot has already sent.
- The service holds the game until the bot answers. So answer with the game's first state rather
  than calling `update`, and don't let the answer wait on any `update` of the game, eg. one made
  while answering a join, as it would wait until the start timed out.
- An answer which is invalid in itself fails the start: a player listed twice, more than the
  game's limit, waiting for someone it doesn't list, or a state that isn't newer.
- If a start fails, eg. it timed out or the service couldn't save it, the player can ask again. So
  answer a start of a game the bot has already started with its players as they are now.
- Starting closes joining, and the card records the players.

### 4. Updating the game

```rust
mini_apps
    .update(
        GameUpdate::new(game)
            .with_waiting_for(vec![bob])
            .with_state(GameState { seq: 2, shared, private }),
    )
    .await?;
```

Whatever an update doesn't set stays as it was:

- `with_waiting_for`: whose turn it is now, players, each once, or none for no one in particular.
- `finished()`: ends the game, whether it started or not. An update can't start a game.
- `with_result("Bob won")`: at most 200 characters, only with `finished()`.
- `with_removed`: takes players off the game.
- `with_state`: goes to everyone with the game open, `shared` to all, and each player's `private`
  part only to them. `seq` must increase. Include a format version, so that an app left open from an
  older release knows to reload. An update is at most 64 KB.

### 5. Serving the app

OpenChat opens `<endpoint>/app` in a sandboxed frame and talks to it with `postMessage`. It tells the
app whether the user is a player or a spectator, gives a player their token, passes on the game's
state as it changes, and asks the service to start the game when a player's app asks. The browser
side of this is in the TypeScript SDK, at `@open-ic/openchat-botclient-ts/mini_app`.

### 6. Verifying players

A player's app sends its player token in `x-oc-jwt` with each request to the bot:

```rust
let claims = verifier.player(&jwt)?;
// A token outlives a removal by up to an hour, so check they're still playing
```

Spectators never reach the bot: the service passes them the shared state.

### No wagering

Apps must never take or pay out tokens, or anything else of value, eg. a stake to join a game or a
prize paid from the players' stakes. That's gambling, which OpenChat isn't licensed for.
