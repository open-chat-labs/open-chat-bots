# SDK for building canister bots for OpenChat plus some example bots

## Deployment

Inside the rs/scripts folder you will find scripts for deploying the Rust canister example bots. These will create a local canister, build the WASM, install it, and return the bot endpoint.

```bash
cd rs
./scripts/deploy_greet_bot.sh
./scripts/deploy_reminder_bot.sh
```

Successful deployment output example:

```bash

Deployment complete. The greet_bot has the following endpoint:

http://gf4a7-g4aaa-aaaaa-qaarq-cai.raw.localhost:8080

```

## SDK guide

TBD
