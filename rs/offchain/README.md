# SDK for building Rust offchain bots for OpenChat plus some example bots

In the root of the repo there are scripts to deploy the Rust offchain example bots.

- [DiceBot](./scripts/deploy_dice_bot.sh)

```bash
  ./scripts/deploy_dice_bot.sh
```

- [LlamaBot](./scripts/deploy_llama_bot.sh)

```bash
  ./scripts/deploy_llama_bot.sh
```

Note: the Discord and Telegram bridges aren't deployed locally, since they need a Discord app or a
Telegram bot, and must be reachable by OpenChat.

- [Discord bridge](./bridges/discord/README.md)
- [Telegram bridge](./bridges/telegram/README.md)

## SDK

[Start here](../sdk/README.md)

## Link previews

Offchain bots fetch OpenGraph link previews for messages automatically. See
[the SDK README](../sdk/README.md#link-previews-og_previews) for how to configure or disable that.
