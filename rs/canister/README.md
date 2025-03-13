# SDK for building canister bots for OpenChat plus some example bots

## Deployment

Inside the rs/scripts folder you will find scripts for deploying the Rust canister example bots. These will create a local canister, build the WASM, install it, and return the bot endpoint.

```bash
cd rs
./scripts/deploy_greet_bot.sh # Deploy the greet bot
./scripts/deploy_reminder_bot.sh # Deploy the reminder bot
```

Successful deployment output example:

```bash
# Example Output for deploying the greet_bot 
Deployment complete. The greet_bot has the following endpoint:

http://gf4a7-g4aaa-aaaaa-qaarq-cai.raw.localhost:8080

# Example Output for deploying the reminder_bot
Deployment complete. The reminder_bot has the following endpoint:

http://huw6a-6uaaa-aaaaa-qaaua-cai.raw.localhost:8080
```

## SDK guide

TBD
