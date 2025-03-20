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
    ReadChatDetails,
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
