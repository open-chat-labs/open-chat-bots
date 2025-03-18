# SDK for bots built in Rust

## Overview

Bots are server components that can interact with OpenChat, typically by sending messages, within particular scopes (channels/groups/direct chats).

At a mimimum, in order to be registered as a bot on OpenChat, bots must return a `bot definition` in response to an HTTP GET to the path `/bot_definition`.

## Bot API

The src contains a folder [api](./src/api/) which represents the API that bots provide to the OpenChat frontend.

### Bot definition

The Bot API defines the [BotDefinition](./src/api/definition.rs) which when serialised as JSON conforms to the [Bot definition _schema_](<(../../schema/bot_schema.json)>).

Let's do a deep dive...

The first thing to notice is that it _doesn't_ contain the bot's `name`. This is because the bot name must be unique within OpenChat and so a name is chosen when the bot is registered.

It does include the description of the bot which is shown in the OpenChat UI in various places associated with the bot.

It also defines a list of commands. When a bot is installed in a particular location (community/group/direct chat), users within this location can issue commands by typing '/' in the message input. This pops up a list of available commands aggregated across all bots installed in this location. In the message entry, users can type further characters to filter the list of commands until they have selected the desired command.

Finally, the bot definition specifies the optional `AutonomousConfig`.

#### Commands

Each command has a `name` and optional `description` which are self explanatory.

The optional `placeholder` is a temporary message shown in the chat panel when the OpenChat app is waiting for a response from the bot. If this is left undefined then the message just shows "...".

Next, are the list of `params` the command takes which could be empty. When a user types a `/command` they can either select it from the popup, in which case if there are command parameters defined, a dialog box will be shown with appropriate UI input widgets for each type of parameter. Or, the user can fully type the `/command` and keep typing any parameter values (aka arguments) into the message entry field, in which case OpenChat will validate any inputs to ensure they conform to the parameter definitions. Each parameter has a `name` and optional `description`. It has an optional `placeholder` which is shown in the parameter input widget as a guide to the user. Next is a flag to indicate whether this is a `required` parameter. If not the user can leave it empty and the bot will use a default value. Finally the `param_type` is specified. A parameter can be either a boolean, a string, an integer, a decimal, a datetime, or an open chat user id. In the case of strings, integers and decimals, the range of possible inputs can be specified and a list of possible `choices` provided. If `choices` are specified, then OpenChat will show a drop down list for this parameter with the possible options.

Next up, are the command `permissions`. This is the set of permissions the bot requires to take action(s) on OpenChat when this command is executed. For simplicity, the `BotPermissions` type includes permissions for all types of OpenChat action, whether at community, chat, or message scope regardless of whether this makes sense when used in a particular context. For instance, commands can currently only be issued within chats so community permissions like `CreatePrivateChannel`, don't apply, whereas they _do_ make sense for a bot acting with a community scoped API key. When the owner of a particular location (community/group/direct chat) installs a bot, they can choose which permissions to grant to the bot and this will determine which commands are available for use within this location.

Next, the command has an optional `default_role`. This can be either `Owner`, `Admin`, `Moderator` or `Participant` and defaults to the latter if none is specified. This is a hint to OpenChat to use this default when asking the bot installer which roles should be able to call this command. In fact, at the time of writing, OpenChat does _not_ ask the installer which roles can call each command, and so `default_role` actually allows the bot developer to specify which roles should be able to call this command. Roles are hierarchical, so for instance, if the `default_role` is `Admin` this means it can be called by all members with the `Admin` or `Owner` role.

Finally, commands have a `direct_messages` flag. This indicates to OpenChat that this command should be used in a "direct message" scenario. This only applies when a bot is installed as a direct chat. In this case, if free text is entered in the message box rather than a `/command`, OpenChat will actually send the `direct_messages` command to the bot and split the user text and bot response into two separate messages, rather than just seeing the bot response messages with the command prefixed. This allows the user to interact in familiar conversational style with the bot and is particularly appropriate for AI bots. To take effect, the command must also specify only a single string parameter. Only one command, if any, should be flagged with `direct_messages` or else OpenChat will pick the first matching command.

#### Autonomous configuration

TBD

### Bot command handling

TBD

## OpenChat API

The src contains a folder [oc_api](./src/api/) which represents the API that the OpenChat backend provides to bots.

TBD
