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

Note: the DiscordBot cannot be deployed locally because it needs to be reachable by Discord.

- [DiscordBot](./rs/offchain/examples/discord/README.md)

## SDK

[Start here](../sdk/README.md)

## Link previews

Offchain bots fetch OpenGraph link previews for messages automatically. See
[the SDK README](../sdk/README.md#link-previews-og_previews) for how to configure or disable that.
