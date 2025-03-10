# OpenChat + Discord bot

A combination of an `OpenChat` and a `Discord` `bot` used to relay messages from _Discord_ to _OpenChat_.

**Note: bots are not yet passing messages from OpenChat to Discord!**

## Setting up the bot with Discord

### As a developer

To use this bot right now you can register it within [Discord's developers portal](https://discord.com/developers/applications). Select the **"New Application"** button in the top right corner, and follow the prompts until your app is created.

Once your app is created, under the **"General Information"** you'll find your app ID and public key, and various URL values you may set. It is important **NOT** to set _interactions endpoint url_; since our bot uses WebSockets for communication with Discord servers, setting the _interactions url_ may prevent any data from reaching the bot.

Within the **"Installation"** section you'll find default installation contexts. We'd encourage you to set this up to your preferences; our test settings were to use User and Guild context, with bot scope in the Guild context and "Send Message" permission.

Next, go to the **"Bot"** section for your app, and there you can generate an access token for your bot - make sure you record this value, and keep it secure; do not commit it to version control. The bot consumes this value via `config.toml`, how exactly this value is injected into the config should depend on your deployment process.

Also, while there, make sure to turn on the _Message Content Intent_ which should allow the bot to receive the message content in most messages. One thing to note here is that this setting will make the bot subject to review and approval once the bot reaches 100+ servers.

**To add the bot to your server** - go back to the **Installation** section from the menu. There you will find a Discord provided install link (or you may register your own), which you can then copy/paste into your browser address bar, and follow the _Add App_ flow.

### As a user

_This bot is not (yet?) available in the Discord apps marketplace._

## Setting up the bot with OpenChat

To register a bot within the OpenChat you will need to use the `/register_bot` command, and to complete the registration you will need to generate a principal for your bot, since this is an off-chain bot.

To generate the principal, you will need to first generate a private `pem` key for your bot:
```bash
openssl ecparam -genkey -name secp256k1 -out private_key.pem
```

Then use the provided `ts` script to get the principal:
```bash
node ts/packages/library/scripts/report_principal.js path/to/bot/key.pem
```

Principal should then be provided in the bot registration modal.

NOTE: You will still need your bot's pem key, so keep it safe.

### This is an autonomous bot

Since this is also an autonomous bot, it can send messages directly to OC without user intervention, you will need to generate an API key. You can do this in the _members_ section:
- If you've not added a bot to your channel yet, click _Add bots_,
- Otherwise find the bot in list, and click to generate API key.

Keep the API key secure, it's a secret!

## How to run

For the _Discord_ bot to start up properly you will need a `config.toml`. The easiest way to set it up is to copy the `exmaples/discord/sample.config.toml` from the repository, and modify it.

Once you have the configuration file all set up, place its path into your `rs/.env` file to tell the bot where to find it:
```
# rs/.env
CONFIG_FILE=examples/discord/config.toml
```

If this is not set, the bot will default to `./config.toml` path, and you might get an error saying config file could not be found if it's not there already. The assumed usefulness of the default value is in production environments where the config is placed next to the built binary.

To run the bot you will also need to set configuration values. Please refer to _sample config_ for details about config values and how to set them, and even generate them.

Once the config is set, you can simply run the bot:
```bash
cd rs
cargo run -p discord-bot
```

## How to use

Once the bot(s) is set up on both sides - Discord and OpenChat - you will need to make the connection between the two. This is done by copying the API key for a specific OC channel, and using the `/connect [oc_api_key arg]` command on the Discord side.

This procedure indicates to the bot that any messages sent within that Discord channel should also be relayed to OpenChat using that specific token. The OC channel API key specifies to which particular OC channel a message should be relayed.

At this point, messages should freely flow from Discord to OpenChat. You can check the status of the bots by calling `/status`. On the Discord side, `status` provides info about the relay connection, and any potential issues with the relay; on the OpenChat side `status` tells if that channel is connected to any channels on the Discord side.

In case you want to stop relaying messages to OpenChat, or you've made a connection between wrong channels, you can use the `/disconnect` command on the Discord side, which should stop messages from being relayed.

## Upcoming!

Features we will certainly look into:
- Passing messages from OpenChat to Discord

Features that require more consideration:
- message deletion
- Support for threads
- Support for reactions
