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

A bot can host an app, eg. a game, which members of a chat open from a card the bot posts there.
The card is markdown text, with an optional image, the game's players, whose move it is and its
result, and an Open button, all of which OpenChat draws. Its text, image, player limit and whether
others can watch never change: OpenChat refuses an edit of it. Its status, players, whose move it is
and its result are the bot's to [keep up to date](#keeping-the-card-up-to-date). Everything
interactive, eg. a lobby, a board and buttons, is the bot's own web page, which OpenChat shows in a
sandboxed frame.

The [PressCounterBot](../offchain/examples/press_counter) is an example, with how to run it against
a local OpenChat.

### Posting a card

```rust
let card = MiniAppContent::new("**Tic-tac-toe** · tap Open to play")
    .with_max_players(2)
    // Whether members who aren't playing can open the app once the game has started
    .with_spectators(true)
    // eg. the member who ran the command
    .with_players(vec![initiator]);

client
    .send_message(MessageContentInitial::MiniApp(card))
    .execute_async()
    .await;
```

- Only bots installed in the chat can post one, and they need `MessagePermission::MiniApp`, eg. in
  the command's `permissions`.
- `MiniAppContent::validate` checks the card as OpenChat does, with its errors: the text has 1 to
  2,000 characters, `max_players` is 1 to 100, the players are at most that many (or 100), each
  listed once, only a card open to spectators has a `spectator_count`, only players are waited for,
  each once, and only a finished game has a result, of 1 to 200 characters.
- A card must be sent finalised, as `send_message` sends messages by default, or OpenChat refuses
  it.
- It can't be posted in a direct chat, nor forwarded, so a bot should set its definition's
  `restricted_locations` to communities and groups.

A card can have an image, shown above the text, eg. the game's artwork. Upload it to OpenChat's
storage first, as for an image message, so that it's scanned like any image and deleted with the
card. `Client::upload_mini_app_image` reads a PNG's size, and `upload_mini_app_image_of_size` takes
any image with the size you give. OpenChat refuses an image without a width and a height, or
without an image's mime type.

```rust
let image = client
    .upload_mini_app_image(mainnet_storage_index_canister_id(), png, image::ImageFormat::Png)
    .await?;

client
    .send_message(MessageContentInitial::MiniApp(
        MiniAppContent::new("**Tic-tac-toe** · tap Open to play").with_image(image),
    ))
    .execute_async()
    .await;
```

### Keeping the card up to date

As the game goes on, the bot updates the card with `Client::update_mini_app(message_id,
MiniAppUpdate)`, which calls the LocalUserIndex's `bot_update_mini_app`. Whatever the update doesn't
set stays as it was:

- `with_players(..)` as players join or leave, replacing the list. They must be members of the
  chat, or the bot itself.
- `with_status(MiniAppStatus::Active)` when the game starts.
- `with_waiting_for(Some(vec![player]))` each turn, so the card shows whose move it is, or `None`.
- `with_spectator_count(n)`, for a card open to spectators, as members who aren't playing open and
  close the app. The bot counts them itself, so they stay anonymous, eg. the users who've called
  its API in the last minute without playing. Send it only when it changes, and not too often.
- `MiniAppUpdate::finished("Bob won")` at the end: status `Finished`, waiting for no one, and the
  result. A finished card never changes again.

Only the bot which posted the card can update it, as for deleting its own messages:

- With a command's context, eg. straight after posting the card, any installed bot can.
- Autonomously, eg. from its app's API or a background task, the bot must be installed to act
  autonomously: its definition has an `autonomous_config`, even with no permissions, and the
  owner granted it when installing the bot.

From its app's API, with the user's session:

```rust
oc_client_factory
    .build(session.autonomous_context())
    .update_mini_app(session.message_id, MiniAppUpdate::default().with_players(players))
    .in_thread(session.thread)
    .execute_async()
    .await;
```

`MiniAppContent::apply(update)` gives the card as OpenChat leaves it, so a bot keeping its own copy
can `validate` an update before sending it.

### Serving the app

OpenChat opens the bot's endpoint, with any trailing slash removed, followed by `/app`, eg.
`https://tictactoe.example.com/app`. That page talks to OpenChat, its parent window, with
`postMessage`, each message a JSON object with a `kind`:

| From | Message | When |
| --- | --- | --- |
| app | `{ kind: "mini_app_ready" }` | Once the app is listening, to `window.parent` with target origin `"*"`. It carries nothing secret. |
| OpenChat | `{ kind: "initialise_mini_app", token, dark_mode, locale }` | In answer. Accept it only from `window.parent` (`event.source === window.parent`), and send everything after it to its `event.origin`. |
| app | `{ kind: "mini_app_token_request" }` | When the token is about to expire, or the bot's server refused it with a 401 |
| OpenChat | `{ kind: "mini_app_token", token }` | In answer, with a new token |
| OpenChat | `{ kind: "set_dark_mode", dark_mode }` | When the user's theme changes |

The TypeScript SDK's browser entry, `@open-ic/openchat-botclient-ts/mini_app`, does the app's side
of this, with `connectToOpenChat()`. The app calls the bot's server with the token in the `x-oc-jwt`
header, which `ExtractJwtLayer` takes, as it does for commands.

### The session token

OpenChat gives the app a `BotMessageSession` token for the user and the card, once it has checked
the user is a member of the chat. It's signed with the key OpenChat signs commands with, and is valid
for 15 minutes. It only vouches for who the user is: OpenChat's bot endpoints refuse it.

```rust
let session = BotMessageSession::parse(&jwt, &oc_public_key, bot_id, now)?;

// A message id is only unique within its chat and thread, so key the app's state by all three
let game = games.get(&session.card());
let player = session.user_id;
```

`parse` checks the signature, that it's a `BotMessageSession` token, that it's for this bot, and that
it hasn't expired (`TokenError::Expired`, to answer with a 401). Checking the bot matters, as
otherwise one bot's server could replay a user's token to another bot. `bot_id` is the user id
OpenChat gave the bot when it was registered, not its principal: an offchain bot can fetch it with
`installation_events().size(0)` on the UserIndex, and a canister bot is told it when it's
registered.

To post in the chat, eg. a game's result as a message of its own, the bot acts autonomously, with a
client built from `session.autonomous_context()`, so it needs that permission in its
`autonomous_config`, eg. `MessagePermission::Text`:

```rust
oc_client_factory
    .build(session.autonomous_context())
    .send_message(MessageContentInitial::from_text(result))
    .in_thread(session.thread)
    .execute_async()
    .await;
```

### No wagering

Apps must never take or pay out tokens, or anything else of value, eg. a stake to join a game or a
prize paid from the players' stakes. That's gambling, which OpenChat isn't licensed for.
