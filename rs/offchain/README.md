# SDK for building Rust offchain bots for OpenChat plus some example bots

In the root of the repo there are scripts to deploy the Rust offchain example bots.

- [DiceBot](../scripts/deploy_dice_bot.sh)

```bash
  ./scripts/deploy_dice_bot.sh
```

- [LlamaBot](../scripts/deploy_llama_bot.sh)

```bash
  ./scripts/deploy_llama_bot.sh
```

- [TicTacToeBot](../scripts/deploy_tictactoe_bot.sh), which plays tic-tac-toe in a
  [MiniApp message](../sdk/README.md#miniapp-messages). Grant it the MiniApp permission to act
  autonomously when you install it, so it can edit the game as it's played.

```bash
  ./scripts/deploy_tictactoe_bot.sh
```

Note: the bridges aren't deployed locally, since they need a Discord app, a Telegram bot or a Twitch
app, and must be reachable by OpenChat.

- [Discord bridge](./bridges/discord/README.md)
- [Telegram bridge](./bridges/telegram/README.md)
- [Twitch bridge](./bridges/twitch/README.md)

## SDK

[Start here](../sdk/README.md)

## Link previews

Offchain bots fetch OpenGraph link previews for messages automatically. See
[the SDK README](../sdk/README.md#link-previews-og_previews) for how to configure or disable that.
