# SDK for bots built in Rust

## Overview

Bots are server components that can interact with OpenChat, typically by sending messages, within particular _scopes_ (channels/groups/direct chats).

At a mimimum, in order to be registered on OpenChat, bots must return a `bot definition` in response to an HTTP GET to the path `/bot_definition`.

Within the SDK is an `api` folder which reflects the [Bot API](#bot-api) that bots provide to the OpenChat frontend, and an `oc_api` folder which reflects the [OpenChat API](#openchat-api) the OpenChat backend provides to bots.

## Bot API

### Bot definition

The Bot API defines the [BotDefinition](./src/api/definition.rs) which when serialised as JSON conforms to the [Bot definition _schema_](<(../../schema/bot_schema.json)>).

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

Finally, the bot definition specifies an optional [AutonomousConfig](#autonomous-configuration).

#### Commands

When a bot is installed in a particular _location_ (community/group/direct chat), users within this location can issue commands by typing '/' in the message input. This pops up a list of available commands aggregated across all bots installed in this location. In the message entry, users can type further characters to filter the list of commands until they have selected the desired command.

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

When a user types a `/command` they can either select it from the popup, in which case if there are command parameters defined, a dialog box will be shown with appropriate UI input widgets for each type of parameter. Or, the user can fully type the `/command` and keep typing any parameter values (aka arguments) into the message entry field, in which case OpenChat will validate any inputs to ensure they conform to the parameter definitions. Each parameter has a `name` and optional `description`. It has an optional `placeholder` which is shown in the parameter input widget as a guide to the user. Next is a flag to indicate whether this is a `required` parameter. If not the user can leave it empty and the bot will use a default value. Finally the `param_type` is specified.

```
pub enum BotCommandParamType {
    UserParam,
    BooleanParam,
    StringParam(StringParam),
    IntegerParam(IntegerParam),
    DecimalParam(DecimalParam),
    DateTimeParam(DateTimeParam),
}
```

A parameter can be either a boolean, a string, an integer, a decimal, a datetime, or an open chat user id. In the case of strings, integers and decimals, the range of possible inputs can be specified and a list of possible `choices` provided. If `choices` are specified, then OpenChat will show a drop down list for this parameter with the possible options.

Next up, are the command [permissions](#bot-permissions). This is the set of permissions the bot requires to take action(s) within OpenChat when this command is executed. For simplicity, the `BotPermissions` type includes permissions for all types of OpenChat action, whether at community, chat, or message scope regardless of whether this makes sense when used in a particular context. For instance, commands can currently only be issued within chats so community permissions like `CreatePrivateChannel`, don't apply, whereas they _do_ make sense for a bot acting with a community scoped API key. When the owner of a particular location (community/group/direct chat) installs a bot, they can choose which permissions to grant to the bot and this will determine which commands are available for use within this location.

Next, the command has an optional `default_role`. This can be either `Owner`, `Admin`, `Moderator` or `Participant` and defaults to the latter if none is specified. This is a hint to OpenChat to use this default when asking the bot installer which roles should be able to call this command. In fact, at the time of writing, OpenChat does _not_ ask the installer which roles can call each command, and so `default_role` actually allows the bot developer to specify which roles should be able to call this command. Roles are hierarchical, so for instance, if the `default_role` is `Admin` this means it can be called by all members with the `Admin` or `Owner` role.

Finally, commands have a `direct_messages` flag. This indicates to OpenChat that this command should be used in a "direct message" scenario. This only applies when a bot is installed as a direct chat. In this case, if free text is entered in the message box rather than a `/command`, OpenChat will actually send this command to the bot, and will split the user text and bot response into two separate messages. This allows the user to interact in a conversational style particularly appropriate for AI bots. To take effect, the command must also specify a single string parameter. Logically, only one command should have `direct_messages` set to true but in case there are multiple, OpenChat will simply pick the first one.

#### Autonomous configuration

TBD

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

### Bot command handling

TBD

## OpenChat API

TBD
