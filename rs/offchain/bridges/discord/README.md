# OpenChat ↔ Discord bridge

Bridges Discord channels with OpenChat groups and public channels. Messages, edits and deletions
in either appear in both:

- **Discord → OpenChat:** messages are relayed as their Discord authors. OpenChat shows the author's
  Discord name and avatar with a "Discord" badge, or their OpenChat profile if they've linked their
  Discord account to it.
- **OpenChat → Discord:** messages are posted through a webhook in the Discord channel, with their
  author's OpenChat name and avatar.

It's an OpenChat bot, OpenChat's bridge bot for Discord. OpenChat lets only that bot relay messages
from Discord as their authors, and edit the messages it relayed. The shared parts of the bridge,
also used by the Telegram bridge, are in [`../core`](../core).

## How it works

- **Pairing a channel:**
  1. In the Discord channel, someone who can manage channels and webhooks runs `/bridge`. The bridge
     creates a webhook in the channel and replies with a code, valid for 15 minutes.
  2. In OpenChat, the group or community installs the bridge bot, granting the permissions it asks
     for.
  3. An admin runs `/bridge <code>` in the group or channel to bridge with.

  `/unbridge` on either side stops the bridging. A chat can be bridged with one chat on the other
  side at a time. Pairing again replaces the old pairing.
- **Linking accounts:** an OpenChat user opens their profile and chooses *Link Discord* under
  *Linked accounts*.
  1. OpenChat gives them a one-time code and sends them to the bridge's `/link?code=...`.
  2. The bridge sends them through Discord's OAuth consent page, which tells it whose account it is.
  3. It redeems the code for that account.

  `/unlink` in Discord unlinks the user's account. They can also unlink from their OpenChat profile.
- **State:** pairings, which messages were relayed as which, and which notifications were handled
  are kept in DynamoDB. Without a table, they're kept in memory and lost on restart.
- **Reliability:** OpenChat retries a notification the bridge fails to relay, and the bridge drops
  one it has already handled. Messages are relayed into OpenChat with ids derived from their
  Discord ids, so a retried send can't post a message twice.

## Not yet

- **Only text is relayed.**
  - Discord attachments become links, which Discord expires after a while.
  - OpenChat media become links to OpenChat's copies.
- **Not relayed:** reactions, threads, and OpenChat's private channels. OpenChat doesn't send bots
  the messages of private channels.
- **Replies to OpenChat messages:** webhooks can't reply on Discord, so a reply relayed there starts
  with a link to the message it replies to.
- **Mentions:** they're relayed as `@name` text, and never ping anyone on Discord.
- **`@everyone` from Discord** only notifies the OpenChat chat's members if its author could ping
  everyone on Discord.
- **Order:** a quick burst of Discord messages can arrive in OpenChat slightly out of order, since
  Discord's events are handled concurrently.

## Setting it up

1. **A Discord application**, at <https://discord.com/developers/applications>:
   - **Bot:** add a bot, and enable the *Message Content* intent.
   - **OAuth2:** add the redirect `{PUBLIC_URL}/oauth/callback`, and note the client id and secret.
   - **Invite:** invite the bot to servers with the `bot` and `applications.commands` scopes, and the
     permissions View Channels, Send Messages, Read Message History and Manage Webhooks:

     ```
     https://discord.com/oauth2/authorize?client_id=<client id>&scope=bot+applications.commands&permissions=536939520
     ```

2. **An identity for the OpenChat bot.** Keep it secret, as it's what lets the bridge act as the
   bot:

   ```bash
   openssl ecparam -genkey -name secp256k1 -out identity.pem
   ```

3. **Register the bot on OpenChat:**
   - Use the endpoint `PUBLIC_URL` and the identity's principal. OpenChat reads the bot's definition
     from `{PUBLIC_URL}/bot_definition`.
   - Then a platform operator makes it the Discord bridge bot, on the */admin* page (`set_bridge_bot`).
     Until then, OpenChat refuses its relayed messages.

4. **A DynamoDB table:**
   - **Partition key:** the string attribute `k`.
   - **TTL:** enabled on the attribute `ttl`.
   - **Permissions:** the bridge needs `dynamodb:GetItem`, `PutItem` and `DeleteItem` on the table.

5. **Run the container,** built from `rs/`:

   ```bash
   docker build -f offchain/bridges/discord/Dockerfile -t oc-discord-bridge .
   ```

   It serves OpenChat's requests on `PORT`, which must be reachable at `PUBLIC_URL` over HTTPS.

6. **Point the website at it:** build the website with
   `OC_DISCORD_BRIDGE_LINK_URL={PUBLIC_URL}/link?code={code}`, so the *Link Discord* option appears.

## Configuration

| Variable | |
|---|---|
| `DISCORD_TOKEN` | The Discord bot's token |
| `OC_IDENTITY_PEM` or `OC_IDENTITY_PEM_FILE` | The OpenChat bot's identity, as PEM text or a file |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `PUBLIC_URL` | For linking accounts. Without them, linking is off. |
| `DYNAMODB_TABLE` | Where state is kept. AWS credentials and region come from the environment. |
| `PORT` | Defaults to 8080 |
| `OC_IC_URL`, `OC_PUBLIC_KEY`, `OC_USER_INDEX` | Only to use an OpenChat other than mainnet's |
| `RUST_LOG` | Log level, eg. `info` (the default) or `oc_bridge_core=debug` |
