# open-chat-bots

SDKs for building Bots for OpenChat with examples

## What kind of bots can I build?

There are broadly three different categories of bot that OpenChat currently supports.

- **Command bots** which accept a command from an OpenChat user from within the OpenChat interface.
- **Integration bots** which accept a command from an external system using an API key.
- **Autonomous bots** which generate their own commands and interact with the OpenChat backend autonomously.

There is some overlap in these capabilities and it is quite possible to create a single bot which acts in all three different ways. We will provide examples of all the different approaches and when you might use each type of bot. Let's discuss these bot types and how they work in more detail.

### All bots

All bots are server components (which may be implemented as an IC canister or any other kind of off-chain server) which will interact with the OpenChat backend in order to provide its functions. A bot's functions may be described by the set of commands that an OpenChat user can trigger from within OpenChat to interact with it or it may operate autonomously and therefore only express the permissions it required to do so.

All bots must me described in accordance with the bot definition schema which is described [here](./schema/README.md).

Your job is to provide an instance of this definition schema and a server which supports that definition. When defining your schema, pay close attention to the OpenChat permissions that each command will require or that the bot requires to act autonomously. Your bot will be actively prevented from taking any actions requiring permissions that the bot did not specify that it would need.

To test your bot, we recommend that you start by running OpenChat locally. Please refer to the [OpenChat readme](https://github.com/open-chat-labs/open-chat/blob/master/README.md) for help with this. When you have a test bot running and an instance of OpenChat running locally you are ready to try to register your bot using the built-in `/register_bot` command (which is only available in developer mode).

#### Registering the bot

The `/register_bot` command will load a modal to allow you to enter the details of your bot. Importantly this includes the endpoint that OpenChat should use to communicate with your bot. When you provide this endpoint, we will then attempt to load and validate your bot's definition schema. Take the time to browse through the parsed definition - this is how OpenChat understands your bot's behaviour and how it will control the user's interactions with your bot. When you are happy, you can register the bot. Note that in the live environment, your bot can only be registered via a special proposal type within the OpenChat proposals channel. This is to ensure that each bot get a certain level of scrutiny and that the DAO agrees in principal that it is a useful addition.

#### Installing the bot

Once a bot is registered with OpenChat it becomes available to be added to any community or group by the owner(s) of that community or group. This is done via the members panel. If a bot exposes commands, when you choose to add a bot to a community or a group you will be presented with a summary of what commands the bot provides and what permissions it is asking for in support of those commands. You, as an owner of the community or group can choose which permissions you are prepared to actually _grant_ to the bot. If any permission requested by the bot is _not_ granted, then any commands which require that permission will not be available to the users in this context.

Once the bot is added to the community or group, if it supports commands, it will be available to your users. They can simply start typing with a `/` to see which commands are available in the current context. OpenChat will use the information in the definition schema you provided to show the user what the commands are and what (if any) parameters they require.

Let's now consider what's different about the different types of bot.

### Command bots

Once a user has selected a command and filled in any parameters that may be required, OpenChat will attempt to obtain an authorisation token. We will check that the user and the bot have the permission to do what they are asking to do in principal and then, if all is well, we will create an authorisation token in the form of a json web token signed with the OpenChat private key. This token will then be automatically sent to your bot's endpoint and contains all of the information required by your bot to take action.

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

To understand how to handle receiving this token it is best to refer to the specific code examples in this repo and to the readme files referenced below. The important takeaways though are that the token _must_ be passed on when communicating between your bot server and the OpenChat backend (so that OpenChat can be sure that the interaction was initiated and authorised within OpenChat). And it is _highly recommended_ that your bot should verify the signature of the token using the OpenChat public key rather than simply decode and trust its contents. If you use the supplied support libraries (as we strongly recommend that you do), both of these things will be taken care of for you and your interactions with the OpenChat backend should be straightforward.

#### Command lifecycle

A command bot's `execute_command` request handler should return as quickly as possible. What the bot returns depends on the nature of the bot and what task(s) it will be performing. If the bot is able to synchronously and quickly respond to the user's command then it should respond with the final message that it sends to the OpenChat backend. We indicate that the message is the final version by setting the finalised flag to true in that case.

However, in many cases, the bot will have some asynchronous and/or longer running task to perform such as coordinating some data retrieval from another serivce. In this case, it is a good idea to provide some feedback to the user telling them what the bot is doing in the form of a placeholder progress message.

There are couple of different strategies that you can employ to achieve this. Firstly, you can specify a placeholder message for a command within the bot definition schema. This placeholder will then be inserted into the timeline of the user executing the command _immediately_. The advantage of this is that the feedback to the user is instant. The disadvantage is that the message must be static i.e. something like "Processing command ..." rather than a dynamic message based on the command's actual arguments like "Searching Spotify for the artist 'Prince'".

A second approach is to have your bot immediately return with the placeholder progress message _before_ it goes on to perform its asynchronous work. In this scenario, the bot should create a placeholder progress message (using the provided libraries). This is a message with the `finalised` flag set to false to indicate that it is not the final version of the message. This message should be immediately return to the OpenChat frontend and also sent to the OpenChat backend (so that _other_ OpenChat users will also see it). The bot, can then perform it's work and finish off by sending a _final_ message (a message created with the finalised flag set to true) to the OpenChat backend.

It is up to you to choose the appropriate combination of techniques for your case. Please refer to the example bots in this project to see our recommended approach and, of course, reach out to us on OpenChat if you would like advice or help about how best to structure your bot.

### Integration Bots

For integration bots the flow is a little different because the interaction is not triggered by an OpenChat user but by another external system. If you want an external system to be able to trigger your bot you will need to generate an API key to give to your external system.

#### API keys

As a community or group owner, when you have installed a bot into a specific context, you will have the option to generate an API key for that context. This option is available from the bot's entry in the members list (assuming that you have the permission). When you choose to generate an API key, you will be asked to select what permissions you wish to encode in this key relative to the permissions that the bot is seeking. You will then be shown the generated key. You must copy this straight away as you will not be able to see it again (although you can always generate a new one).

This API key can then be securely stored in a third party system (a good example might be to store it as a github secret if you wanted to integrate with github actions). Then when the third party system wants to trigger some action within OpenChat it should simply send the API key to your bot. You can use whatever endpoint you like and supply whatever supplemental data you like when calling your bot, as long as you pass in the API key.

You bot will then use that API key to (attempt to) obtain an auth token from the OpenChat backend which will then allow it to interact with OpenChat (limited by the scope and the permissions encoded in the API key). Please refer to the platform specific readmes and example code for exactly _how_ this API key is consumed, but if you use the utility libraries provided you will not have to deal with manually requesting the auth token your self, you will simply have to provide the API key.

```
External System           Bot Server            OC Backend
       |                       |                     |
       |-- action + API key -->|                     |
       |                       |--- request auth --->|
       |                       |<---- auth token ----|
       |<--- bot response -----|                     |
       |                       |------- action ----->|
       |                       |<----- response -----|
       |                       |------- action ----->|
       |                       |<----- response -----|
       |                       |                     |
```

### Autonomous Bots

An autonomous bot is conceptually very similar to an integration bot except that it is likely that it will be _initialised_ with one or more API keys. This means that it can then operate on its own schedule and simply request an auth token whenever it needs to using the API key that it already has. How the API key(s) are injected into the bot are up to you, but keep in mind that they should be kept secret so good security practices are required.

```
                 Bot Server            OC Backend
                      |                     |
  init with API key ->|                     |
                      |--- request auth --->|<-------|
                      |<---- auth token ----|        |
                      |                     |        |
                      |------- action ----->|        |
                      |<----- response -----|        |
                      |                     |--------|
```

### For off-chain typescript bots

See [the typescript readme](./ts/README.md).

### For information about the required bot schema

See [the bot definition schema readme](./schema/README.md).

    "autonomous_config": {
      "$ref": "#/definitions/AutonomousConfig",
      "description": "Configuration for the bot's autonomous behaviour"
    }

    "AutonomousConfig": {
      "type": "object",
      "description": "Configuration for the bot's autonomous behaviour",
      "properies": {
        "permissions": {
          "$ref": "#/definitions/BotPermissions",
          "description": "The permissions required to execute in this context. These are broken down into Community level, Chat level and Message level permissions."
        }
      }
    },
