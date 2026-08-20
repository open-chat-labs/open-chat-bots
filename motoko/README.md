# Overview

This is an SDK for building OpenChat canister bots in Motoko with some example bots.

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

# Link previews (og_previews)

OpenChat messages can carry OpenGraph link previews - the title/description/image card you see
under a link. OpenChat does not scrape links itself, it just stores whatever the sender gives it,
so bots have to supply them.

Use `withOgPreviews` on the send message builder:

```motoko
let result = await client
    .sendTextMessage("check this out https://example.com")
    .withOgPreviews([{
        url = "https://example.com";
        title = "Example";
        description = "An example";
        image = null;
    }])
    .execute();
```

The field is tri-state:

| `withOgPreviews` | behaviour |
| --- | --- |
| not called | no previews are sent, and OpenChat is left to decide |
| called with a non-empty array | that array is sent as-is |
| called with `[]` | no previews are sent |

This SDK is **pass-through only** - it will never fetch previews for you. Doing so would mean an
http outcall to a scraper from inside your canister, replicated across the subnet and costing
cycles on every send. The offchain TypeScript and Rust SDKs do fetch automatically; if you want
previews from a canister bot you have to build them yourself.

Note that ephemeral messages never carry previews - they are not sent to the OpenChat backend.

# Thanks

Special thanks to [@gekctek](https://github.com/Gekctek), who built an interim Mokoto SDK before this one was ready. We have used large chunks of his SDK, especially the JSON serializing/deserializing, in this SDK.

You can find his repo here:
https://github.com/edjcase/motoko_oc_bot_sdk
