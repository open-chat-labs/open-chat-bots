# OpenChat Bot framework overview

## What kind of bots can I build?

There are broadly three different categories of bot that OpenChat currently supports.

- **Command bots** which accept a command from an OpenChat user from within the OpenChat interface.
- **Integration bots** which accept a command from an external system using an API key.
- **Autonomous bots** which generate their own commands and interact with the OpenChat backend autonomously.

There is some overlap in these capabilities and it is quite possible to create a single bot which acts in all three different ways. We will provide examples of all the different approaches and when you might use each type of bot. Let's discuss these bot types and how they work in more detail.

## All bots

All bots are server components (which may be implemented as an IC canister or any other kind of off-chain server) which will interact with the OpenChat backend in order to provide its functions. A bot's functions may be described by the set of commands that an OpenChat user can trigger from within OpenChat to interact with it or it may operate autonomously and therefore only express the permissions it required to do so.

All bots must be described in accordance with the bot definition schema which is described [here](./schema/README.md).

Your job is to provide an instance of this definition schema and a server which supports that definition. When defining your schema, pay close attention to the OpenChat permissions that each command will require or that the bot requires to act autonomously. Your bot will be actively prevented from taking any actions requiring permissions that the bot did not specify that it would need.

To test your bot, we recommend that you start by running OpenChat locally. Please refer to the [OpenChat readme](https://github.com/open-chat-labs/open-chat/blob/master/README.md) for help with this. When you have a test bot running and an instance of OpenChat running locally you are ready to try to register your bot using the built-in `/register_bot` command (which is only available in developer mode).

### Registering the bot

The `/register_bot` command will load a modal to allow you to enter the details of your bot. Importantly this includes the endpoint that OpenChat should use to communicate with your bot. When you provide this endpoint, we will then attempt to load and validate your bot's definition schema. Take the time to browse through the parsed definition - this is how OpenChat understands your bot's behaviour and how it will control the user's interactions with your bot. When you are happy, you can register the bot.

When you register a bot it won't yet be available to all users to install. As the owner of the bot you will be able to install the bot in any group or community you own, or as a direct chat. As part of the registration you can additionally specify one other group or community for testing purposes and its owner will be be able to install the bot. When your bot has been fully tested and is ready for prime time you can make a "publish bot" proposal to make the bot publicly available. This is to ensure that each bot gets a certain level of scrutiny and that the DAO agrees in principal that it is a useful addition.

### Installing the bot

Once a bot has been registered with OpenChat and then published it becomes available to be added to any community or group by the owner(s) of that community or group, or as a direct chat by any user. In the case of groups and communities this is done via the members panel, or for a direct chat you can search for it in the direct chats section.

If a bot exposes commands, when you choose to install it, you will be presented with a summary of commands the bot provides and the permissions it _requires_ in support of those commands. You, as an owner of the community or group can choose which permissions you are prepared to actually _grant_ to the bot. If any permission requested by the bot is _not_ granted, then any commands which require that permission will not be available to the users in this context.

If the bot supports autonomous operation you will also be asked if you wish to configure the autonomous permissions and generate an API key for the scope that you are installing the bot into. If you choose to generate an API key at this stage, and if the bot supports it, you can also choose to automatically and securely send that API key to the bot (so that it can operate autonomously in this context going forward).

Once the bot is installed in a group or community, if it supports commands, it will be available to the members. They can simply start typing with a `/` to see which commands are available in the current context. OpenChat will use the information in the _definition_ provided by the bot to show the user the available commands and what (if any) parameters they require.

Let's now consider what's different about the different types of bot.

## Command bots

Once a user has selected a command and filled in any required parameters, OpenChat will attempt to obtain an authorisation token. We will check that the user and the bot have the permission to do what they are asking to do in principal and then, if all is well, we will create an authorisation token in the form of a json web token (a JWT) signed with the OpenChat private key. This token will then be automatically sent to your bot's endpoint (currently in the HTTP POST body but soon as an HTTP header) and contains all of the information required by your bot to take action.

```
User          OC Frontend           OC Backend          Bot Server
 |-- executes ---->|                    |                  |
 |                 |-- request auth --> |                  |
 |                 |<-- auth token ---- |                  |
 |                 |--------------- send auth -----------> |
 |                 |<------------- bot response ---------- |
 |                 |                    |<---- action -----|
 |                 |                    |---- response --->|
 |                 |                    |<---- action -----|
 |                 |                    |---- response --->|
 |                 |                    |                  |
```

To understand how to handle receiving this token it is best to refer to the specific code examples in this repo and to the readme files referenced below. The important takeaways though are that the token _must_ be passed on when communicating between your bot server and the OpenChat backend (so that OpenChat can be sure that the interaction was initiated and authorised within OpenChat). And it is _highly recommended_ that your bot should verify the signature of the token using the OpenChat public key rather than simply decode and trust its contents. If you use the supplied SDKs (as we strongly recommend that you do), both of these things will be taken care of for you and your interactions with the OpenChat backend should be straightforward.

The auth token also contains the "scope" to which it applies and for commands the scope is currently either a group, channel or direct chat.

### Command lifecycle

A command bot's `execute_command` request handler should return as quickly as possible. What the bot returns depends on the nature of the bot and what task(s) it will be performing. If the bot is able to synchronously and quickly respond to the user's command then it should respond with the final message that it sends to the OpenChat backend. We indicate that the message is the final version by setting the finalised flag to true in that case.

However, in many cases, the bot will have some asynchronous and/or longer running task to perform such as coordinating some data retrieval from another serivce. In this case, it is a good idea to provide some feedback to the user telling them what the bot is doing in the form of a placeholder progress message.

There are couple of different strategies that you can employ to achieve this. Firstly, you can specify a placeholder message for a command within the bot definition schema. This placeholder will then be inserted into the timeline of the user executing the command _immediately_. The advantage of this is that the feedback to the user is instant. The disadvantage is that the message must be static i.e. something like "Processing command ..." rather than a dynamic message based on the command's actual arguments like "Searching Spotify for the artist 'Prince'".

A second approach is to have your bot immediately return with the placeholder progress message _before_ it goes on to perform its asynchronous work. In this scenario, the bot should create a placeholder progress message (using the provided libraries). This is a message with the `finalised` flag set to false to indicate that it is not the final version of the message. This message should be immediately return to the OpenChat frontend and also sent to the OpenChat backend (so that _other_ OpenChat users will also see it). The bot, can then perform it's work and finish off by sending a _final_ message (a message created with the finalised flag set to true) to the OpenChat backend.

It is up to you to choose the appropriate combination of techniques for your case. Please refer to the example bots in this project to see our recommended approach and, of course, reach out to us on OpenChat if you would like advice or help about how best to structure your bot.

You may also wish to return a message to the OpenChat front end that is only designed to be seen by the initiator of the command. This might be the case perhaps if your bot is responding to a configuration command that only the owner of the bot's execution context can call. It is also a valid way to handle a validation problem with the command's arguments - rather than tell _everyone_ in the chat that there was a problem, it's best just to tell the person who needs to know. To support this case, messages returned to the OpenChat front end should be marked as `ephemeral`. These messages are only displayed to the initiating user, and they will only persist until the next time the app is refreshed. An ephemeral message should _not_ be sent by the bot to the OpenChat _backend_.

Finally, the command definition has a property, `default_role` with possible values, `Participant`, `Moderator`, `Admin`, `Owner`. At some point the OpenChat interface will allow a group/community owner to specify the allowed member role for each command with the default being the value specified in the definition. However, for now this is not available, and setting `default_role` effectively allows the bot owner to limit which member roles should be able to call each command.

## Integration Bots

For integration bots the flow is a little different because the interaction is not triggered by an OpenChat user but by another external system. If you want an external system to be able to trigger your bot you will need to generate an API key to give to your external system.

### API keys

As a community or group owner, when you have installed a bot, you will have the option to generate an API key for that context. This option is available from the bot's entry in the members list. When you choose to generate an API key, you will be asked to select the permissions you wish to encode in this key relative to the permissions the bot is seeking. You will then be shown the generated key.

This API key can then be securely stored in a third party system (a good example might be to store it as a github secret if you wanted to integrate with github actions). Then when the third party system wants to trigger some action within OpenChat it should simply send the API key to your bot. You can use whatever endpoint you like and supply whatever supplemental data you like when calling your bot, as long as you pass in the API key. Your bot will then be able to use that API key to interact with OpenChat (limited by the scope and the permissions encoded in the API key). If you think your API key might have been compromised, you can generate a new API key and the existing API key will become invalid.

```
External System            Bot Server            OC Backend
       |                        |                     |
       |-- webhook + API key -->|                     |
       |                        |------- action ----->|
       |                        |<----- response -----|
       |<--- bot response ------|                     |
       |                        |                     |
```

Like command JWTs, API keys contain the scope in which it can be used. An API key can be generated for a community and separately for channels within the community. To allow the bot to take "community" actions such as creating a channel an API key must be generated at the community level with the appropriate permissions. However, the permissions cascade, so you could generate a community API key and give it the "send message" permission which will allow the bot to send messages to _any_ channel in the community. If you wish to restrict this behaviour you could choose to give the bot a channel API key(s) to allow it to send messages only in that channel(s).

## Autonomous Bots

Automonous bots also use API Keys to interact with OpenChat. As a bot owner you could choose to give your bot one or more API keys to allow it to take actions (typically send messages) in a particular scope. However, the standard workflow is as follows. In the `AutonomousConfig` section of the bot _definition_ you can set the property `sync_api_key` to `true`. This tells the OpenChat interface to offer a group/community owner to sync an API key with the bot. OpenChat will then automatically call the bot with a special `sync_api_key` command where the command argument contains the API key. Typically the bot will then store this API key in a map keyed by the scope (more later) which will allow the bot to take actions in this scope. The handling of this special command and the API key map are provided by the SDKs. A bot then might offer a command, perhaps with `default_role = Admin`, allowing the user to subscribe to some particular behaviour. The bot would then hold the subscriptions and when some particular event happens use the API key for the given scope to take an OpenChat action. This is all quite abstract so an example will help.

Imagine a reminder bot which can send reminders to you directly or within a group/channel. A group owner say, could install this bot, generate an API key for the group, and be prompted to sync the API key to the bot. Having done so, they could then issue `/remind` commands to set various reminders for the chat. Say,

```
/remind "Daily meeting starts now" "at 9am every weekday"
/remind "Project demo starting" "at 4pm tomorrow"
```

The bot will hold a record of these reminders and send the given messages at the given times to the given chats. In fact there is an [example bot](https://github.com/open-chat-labs/open-chat-bots/tree/main/rs/canister/examples/reminder) provided wuth exactly this behaviour. It also allows the reminders in a chat to be listed and deleted.

```
User          OC Frontend           OC Backend          Bot Server
 |-- sync api key ---->|                    |                  |
 |                     |-- request auth --> |                  |
 |                     |<-- auth token ---- |                  |
 |                     |--------------- send auth -----------> |
 |                     |<------------- bot response ---------- |
 |                     |                    |                  |
 .                     .                    .                  .
 .                     .                    .                  .
 .                     .                    .                  .
 |                     |                    |<---- action -----|
 |                     |                    |---- response --->|
 |                     |                    |                  |
```

## Available actions

Currently the OpenChat bot infrastructure allows the following actions to be taken by bots:

- Send message
  - text
  - image
  - video
  - audio
  - file
  - poll
  - giphy
  - custom
- Create channel
- Delete channel

In time we will add support for the following additional message types:

- Crypto
- Prize
- P2P swap

... the following chat level actions:

- Add/remove reaction
- Update details
- Invite members
- Remove members
- Delete messages
- Pin messages

... and the following community level actions:

- Invite members
- Remove members

If are looking to build a bot which requires any of these actions, or any others not mentioned, please let us know and we can prioritise their availability.

## Read / subscribe to OpenChat events

In addition to taking actions bots can also read and subcribe to OpenChat events:

- Read current chat details
- Read community details (coming soon)
- Read message events
- Read member events
- Read community member events (coming soon)
- Read chat details events
- Subscribe to message events (coming soon)
- Subscribe to member events (coming soon)
- Subscribe to chat details events (coming soon)
- Subscribe to community details events (coming soon)
- Subscribe to community member events (coming soon)

As an example, a moderation bot might wish to subscribe to messages in a chat to flag them as being unsuitable in some way.

Or a welcome bot might subscribe to "member joined" events to send new members a welcome message.

## For information about the required bot schema

See [the bot definition schema readme](./schema/README.md).
