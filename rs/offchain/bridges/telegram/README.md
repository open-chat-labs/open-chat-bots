# OpenChat ↔ Telegram bridge

Bridges Telegram groups with OpenChat groups and public channels. Messages and edits in either
appear in both:

- **Telegram → OpenChat:** messages are relayed as their Telegram authors. OpenChat shows the
  author's Telegram name with a "Telegram" badge, or their OpenChat profile if they've linked their
  Telegram account to it.
- **OpenChat → Telegram:** a bot can't post as anyone else on Telegram, so the bridge bot posts each
  message with its author's OpenChat name in bold before it. Deleting it in OpenChat deletes it on
  Telegram too.

It's an OpenChat bot, OpenChat's bridge bot for Telegram, which only it can relay Telegram messages
as. It runs on AWS Lambda: Telegram sends it updates by webhook, and OpenChat sends it
notifications, so it needs no long-lived connection. The shared parts of the bridge, also used by
the Discord bridge, are in [`../core`](../core).

## How it works

- **Pairing a group:**
  1. An admin of the Telegram group runs `/bridge` there. The bridge sends them a code in a private
     chat, valid for 15 minutes, so others in the group can't use it. They need to have started a
     chat with the bot first, and to run it as themselves rather than anonymously.
  2. In OpenChat, the group or community installs the bridge bot, granting the permissions it asks
     for.
  3. An admin runs `/bridge <code>` in the group or channel to bridge with.

  `/unbridge` on either side stops the bridging. When Telegram upgrades a group to a supergroup,
  which gives it a new id, eg. once it has 200 members, the pairing moves to the new id.
- **Linking accounts:** an OpenChat user opens their profile and chooses *Link Telegram* under
  *Linked accounts*.
  1. OpenChat gives them a one-time code and opens `t.me/<bot>?start=<code>`.
  2. Tapping Start sends the bot `/start <code>`, from their account.
  3. The bridge redeems the code for it.

  `/unlink` in a private chat with the bot unlinks their account.
- **`/status`** tells the user whether their account is linked, and to whom. In a group, it also says
  whether the group is bridged, with a link to the OpenChat chat. Anyone in the group can run it,
  and the reply is posted in the group.
- **State** is kept in DynamoDB, in the same kind of table as the Discord bridge's. The two can share
  a table, as their keys don't overlap.
- **Retries:** Telegram resends an update the bridge didn't answer with 200, and OpenChat resends a
  notification. Messages are relayed into OpenChat with ids derived from their Telegram ids, so a
  resent update can't post a message twice. An OpenChat canister being upgraded, so briefly
  stopped, is retried rather than losing the message.
- **Throughput:** Telegram sends up to 10 updates at once, so one busy group doesn't hold up
  everyone's. Messages sent within a moment of each other can arrive in OpenChat out of order.

## Not yet

- **Telegram channels.** Only groups are bridged.
- **Telegram deletions.** Telegram doesn't tell bots when a message is deleted, so they aren't
  relayed into OpenChat.
- **Media:**
  - Telegram's media are relayed as labels, eg. "[Photo]" or "[Location]", with their captions, as
    their files can only be fetched with the bot's token. Copying them into OpenChat's storage
    needs SDK support.
  - OpenChat's media become links to OpenChat's copies.
- **Avatars:** Telegram users' avatars aren't relayed, for the same reason.
- **Not relayed:** reactions, threads, and OpenChat's private channels. OpenChat doesn't send bots
  the messages of private channels.

## Setting it up

1. **A Telegram bot,** from [@BotFather](https://t.me/BotFather):
   - Note its token and username.
   - Run `/setprivacy` and choose *Disable*, so the bot sees every message in its groups, not just
     commands.

2. **An identity for the OpenChat bot,** made with dfx. Keep it secret, as it's what lets the
   bridge act as the bot. dfx's default storage keeps it encrypted in your keychain.

   ```bash
   dfx identity new telegram_bot
   ```

   Its principal, to register the bot with:

   ```bash
   dfx identity get-principal --identity telegram_bot
   ```

   The bridge takes the identity as `OC_IDENTITY_PEM`, which dfx exports:

   ```bash
   dfx identity export telegram_bot
   ```

3. **Register the bot on OpenChat:**
   - Use the endpoint `PUBLIC_URL` and the identity's principal.
   - Then a platform operator makes it the Telegram bridge bot, on the */admin* page
     (`set_bridge_bot`).

4. **A DynamoDB table:**
   - **Partition key:** the string attribute `k`.
   - **TTL:** enabled on the attribute `ttl`.
   - **Permissions:** the function needs `dynamodb:GetItem`, `PutItem` and `DeleteItem` on the table.

5. **Build and deploy the Lambda function** from `rs/`, with
   [cargo-lambda](https://www.cargo-lambda.info) 1.9.2 or later, which adds Rust's Linux target
   as needed. Older versions can't link with this Rust:

   ```bash
   cargo lambda build --release --arm64 -p oc_telegram_bridge
   ```

   - **A function URL** with auth type NONE. OpenChat signs its requests, and Telegram sends a
     secret derived from the bot's token, which the bridge checks.
   - **A timeout of 60 seconds**, as OpenChat waits that long for an answer.
   - **The environment variables** below. The identity can go straight from dfx, without a PEM
     file, eg.:

     ```bash
     cargo lambda deploy oc_telegram_bridge --enable-function-url --timeout 60 --env-var "OC_IDENTITY_PEM=$(dfx identity export telegram_bot)" --env-var TELEGRAM_TOKEN=<token> --env-var DYNAMODB_TABLE=<table>
     ```

   **Later deploys** are done by the *Deploy Telegram bridge* GitHub Actions workflow
   ([`deploy-telegram-bridge.yaml`](../../../../.github/workflows/deploy-telegram-bridge.yaml)),
   run by hand from `main`:
   - It builds the function and replaces its code, leaving its settings and environment variables
     as they are.
   - It deploys with the IAM role `GitHubActions-DeployTelegramBridge`, which GitHub can assume
     only from `main`:
     - **Trust:** the OIDC provider `token.actions.githubusercontent.com`, with `aud`
       `sts.amazonaws.com` and `sub` `repo:open-chat-labs/open-chat-bots:ref:refs/heads/main`.
     - **Permissions:** only `lambda:UpdateFunctionCode`, `GetFunction`, `GetFunctionConfiguration`
       and `GetFunctionUrlConfig`, on this function.

6. **Register the webhook and the bot's commands** with Telegram, once. Run this with the same
   environment variables, eg. locally:

   ```bash
   cargo run --release -p oc_telegram_bridge -- setup
   ```

   It warns if privacy mode is still on.

7. **Point the website at it:** build the website with
   `OC_TELEGRAM_BRIDGE_LINK_URL=https://t.me/<bot username>?start={code}`, so the *Link Telegram*
   option appears.

## Configuration

| Variable | |
|---|---|
| `TELEGRAM_TOKEN` | The Telegram bot's token. The webhook's secret is derived from it, so after revoking it, run `setup` again with the new one. |
| `TELEGRAM_BOT_USERNAME` | Optional. Without it, the bot's username is looked up on each cold start. |
| `OC_IDENTITY_PEM` or `OC_IDENTITY_PEM_FILE` | The OpenChat bot's identity, as PEM text, eg. from `dfx identity export`, or a file |
| `PUBLIC_URL` | Where the function is served, for `setup` |
| `DYNAMODB_TABLE` | Where state is kept. Without it, state is kept in memory and lost. |
| `PORT` | When run as a server rather than on Lambda. Defaults to 8080. |
| `OC_IC_URL`, `OC_PUBLIC_KEY`, `OC_USER_INDEX` | Only to use an OpenChat other than mainnet's |
| `RUST_LOG` | Log level, eg. `info` (the default) |
