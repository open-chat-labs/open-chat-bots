# SDK for off-chain bots built in Rust

## Deployment guide

1. Change directory into any of the examples. We'll run the `dice` example:

```bash
cd rs/offchain/examples/dice/
```

2. Create a new identity that you'll use for the bot

```bash
dfx identity new testbot_identity --storage-mode=plaintext  # we're using plaintext mode to be able to see the seed phrase
```

3. Export the identity to a `.pem` file:

```bash
dfx identity export testbot_identity
```

4. Get identity of the bot from the generated identity:

```bash
dfx --identity testbot_identity identity get-principal
```

5. Get your open chat public key from the locally running open chat:
   Go to `profile settings` in the `advanced` section and click on the bot client config button, you will see your `Open Chat Public Key`:
   ![Open chat public key](./images/bot-client-config.png)

Now create a `.env` file in the `dice` examples directory & add the config. This is how your `.env` file should look like:

```bash
PEM_FILE="/Users/la/open-chat-hackathon/open-chat-bots/rs/offchain/examples/dice/testbot_identity.pem"
OC_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqFYOW8Y0i+j1JWf1taO34MoDXSkQ\n1PgtMPIYogRQjSFj3NCfc6ZvlPNj8XHv8fPVvm42AOKqWDJ1aNP1e/ggVQ==\n-----END PUBLIC KEY-----\n"
PORT=4000
IC_URL="http://127.0.0.1:8080" # For those running dfx on port 8080
```

You can now run the `dice` bot in the `open chat bots` directory:

```bash
cargo run -- --pem-file /Users/la/open-chat-hackathon/open-chat-bots/rs/offchain/examples/dice/testbot_identity.pem
```

## SDK guide

TBD
