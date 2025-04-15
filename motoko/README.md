# Overview

This is an SDK for building OpenChat canister bots in Motoko with some example bots.

Special thanks to OpenChat user Gekctek, who built an interim Mokoto SDK before this one was ready. We have used large chunks of his SDK, especially the JSON serializing/deserializing, in this SDK.

You can find his repo here:
https://github.com/edjcase/motoko_oc_bot_sdk

# Package

### MOPS

```
mops install openchat-bot-sdk
```

To setup MOPS package manage, follow the instructions from the [MOPS Site](https://j4mwm-bqaaa-aaaam-qajbq-cai.ic0.app/)

# Examples

[https://github.com/open-chat-labs/open-chat-bots/tree/main/motoko/examples](https://github.com/open-chat-labs/open-chat-bots/tree/main/motoko/examples)

First read the [get started guide](../GETSTARTED.md).

There is a very basic bot example [hello_bot](https://github.com/open-chat-labs/open-chat-bots/tree/main/motoko/examples/hello_bot) exposing a single `/hello` command which replies with "hello <username>".

There is another example [ping_bot](https://github.com/open-chat-labs/open-chat-bots/tree/main/motoko/examples/hello_bot) expsosing several commands and webhook endpoints to illustrate various bot capabilities.

Use the [deploy script](https://github.com/open-chat-labs/open-chat-bots/tree/main/motoko/examples/deploy.sh) to install or upgrade an example bot.

```
./deploy.sh hello_bot
./deploy.sh ping_bot
```
