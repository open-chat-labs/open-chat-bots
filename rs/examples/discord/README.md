# OpenChat + Discord bot

A combination of an `OpenChat` and a `Discord` `bot` used to relay messages from _Discord_ to _OpenChat_.

**Note: bots are not yet passing messages from OpenChat to Discord!**

## Setting up Discord bot

[TODO]

## Setting up OpenChat bot

[TODO]

## How to run

For the _Discord_ bot to start up properly you will need a `config.toml`. The easies way to set it up is to copy the `exmaples/discord/sample.config.toml` from the repository, and modify it.

Once you have the configuration file all set up, place its path into your `rs/.env` file to tell the bot where to find it:
```
# rs/.env
CONFIG_FILE=examples/discord/config.toml
```

If this is not set, the bot will by default to `./config.toml` and you might get an error saying config file could not be found. The assumed usefulness of the default value is in production environments where the config is placed next to the built binary.

To run the bot you will also need to set configuration values. Please refer to _sample config_ for details about config values and how to set them, and even generate them.

If you've managed to set all of these correctly, you can simply run the bot:
```bash
cd rs
cargo run -p discord-bot
```

## Upcoming!

Features we will certainly look into:
- Passing messages from OpenChat to Discord
- Support for different message types - image, voice, video, etc.

Features that require more consideration:
- message deletion
- Support for threads
- Support for reactions
