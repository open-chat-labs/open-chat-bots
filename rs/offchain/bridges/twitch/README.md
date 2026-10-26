# OpenChat ↔ Twitch bridge

Bridges Twitch channels' chats with OpenChat groups and public channels. Messages in either
appear in both:

- **Twitch → OpenChat:** messages are relayed as their Twitch authors. OpenChat shows the author's
  Twitch name and profile image with a "Twitch" badge, or their OpenChat profile if they've linked
  their Twitch account to it. Messages deleted by the channel's moderators, or cleared by a ban or
  timeout, are deleted in OpenChat too.
- **OpenChat → Twitch:** a bot can't post as anyone else on Twitch, so the bridge's bot account
  posts each message with its author's OpenChat name before it, eg. `Nelly: hello`. Deleting it in
  OpenChat deletes it on Twitch too, where the bot is a moderator.

It's an OpenChat bot, OpenChat's bridge bot for Twitch, which only it can relay Twitch messages as.
The shared parts of the bridge, also used by the Discord and Telegram bridges, are in
[`../core`](../core).

## How it works

- **Pairing a channel:** only the channel's broadcaster can let the bot into their chat.
  1. The broadcaster opens the bridge's `/bridge` page. OpenChat's `/bridge` without a code links
     to it, as does `!bridge` in a bridged chat.
  2. The page sends them through Twitch's consent page, granting the bot `channel:bot` in their
     channel.
  3. The bridge subscribes to the channel's chat and shows them a code, valid for 15 minutes. It's
     shown on the page rather than in chat, which everyone watching can see.
  4. In OpenChat, the group or community installs the bridge bot, granting the permissions it asks
     for.
  5. An admin runs `/bridge <code>` in the group or channel to bridge with.

  Both chats are told once they're bridged, with a link to the OpenChat chat on the other side, and
  again if they stop being bridged. The bridge doesn't relay its own notices.
- **Unpairing:** any of these stops the bridging:
  - `!unbridge` in the Twitch chat, from the broadcaster or a moderator;
  - `/unbridge` in OpenChat;
  - uninstalling the bot from the OpenChat group or community, in which case only the Twitch chat
    can be told;
  - Twitch revoking the bridge's subscription to the chat, eg. as the broadcaster disconnected the
    app or banned the bot. If it's the bot's own authorization of the app that's gone, which every
    chat relies on, nothing is unpaired. Sign in as the bot at `/authorize-bot` again, and each
    chat is subscribed to again when OpenChat next relays to it.
- **Going live:** when a bridged channel goes live, the bridge tells its OpenChat chat, with the
  stream's title and the channel's link, so members can watch from there, eg.:

  ```
  Nelly is live on Twitch: Speedrunning Celeste
  <https://www.twitch.tv/nelly>
  ```

  - The title is looked up from Twitch, and left out if that fails.
  - The link is in angle brackets, so OpenChat links all of a login which ends in `_`.
  - Twitch can send the event twice, but the notice's OpenChat id is derived from the stream's, and
    OpenChat doesn't post a message whose id the chat has already. So a stream isn't announced
    twice.
  - Nor is it retried: a stream which starts while the bridge is restarting isn't announced, nor is
    one whose notice OpenChat doesn't take within a few seconds.
  - Going offline isn't announced, to keep the chat quiet.
- **Chat commands:** `!bridge` and `!unbridge` are answered only for the broadcaster and the
  channel's moderators. Anyone else's are relayed like any message. `!unbridge` in a chat which
  isn't bridged takes the bot out of it, eg. if the broadcaster got a code but never used it.
- **Linking accounts:** an OpenChat user opens their profile and chooses *Link Twitch* under *Linked
  accounts*.
  1. OpenChat gives them a one-time code and sends them to the bridge's `/link?code=...`.
  2. The bridge sends them through Twitch's consent page, which tells it whose account it is.
  3. It redeems the code for that account.

  They can unlink from their OpenChat profile.
- **Receiving chat:** the bridge gets EventSub's chat events through a conduit, whose one shard is
  the bridge's WebSocket. It uses the app's access token, made from the client id and secret.
  - The subscriptions belong to the conduit, so they survive reconnects and restarts. Each paired
    channel has `channel.chat.message`, `channel.chat.message_delete` and
    `channel.chat.clear_user_messages`, and `stream.online` for it going live, which needs no
    authorization.
  - Chats joined with the broadcaster's `channel:bot` don't count toward Twitch's limit of 100 per
    bot, and the bot shows with the Chat Bot badge.
  - Twitch deletes a conduit after 72 hours with no shard connected, along with its subscriptions.
    The bridge makes a new conduit when it starts, and subscribes each paired channel again when it
    next relays a message there from OpenChat.
- **Posting:** Twitch limits what the bot sends across every channel, and ignores it for an hour
  if it sends more. The bridge paces its messages to suit:
  - **20 messages per 30 seconds** where the bot isn't a moderator or VIP;
  - **100 per 30 seconds** where it is, which the bridge learns from the badges on the bot's own
    messages;
  - **1 per second in each channel.** Twitch only requires it where the bot isn't a moderator or
    VIP. But the bridge only learns the bot has stopped being one from its next message there, by
    when a faster burst would be over the limits.

  Messages are sent one at a time in each channel, in order, timed from when Twitch answers. One
  that would wait over 30 seconds is dropped, as live chat has moved on by then, and OpenChat would
  stop waiting for it. A message Twitch drops, eg. one AutoMod holds, isn't retried, nor is one it
  refuses, eg. while the bot is timed out.
- **Make the bot a moderator** in busy chats, with `/mod <bot>`. Its messages there then don't
  wait on the bot's 20 per 30 seconds across every chat, and it can delete what's deleted in
  OpenChat.
- **Avatars:** a relayed message's author's profile image is looked up from Twitch, and kept for a
  day. Twitch serves the images publicly, so OpenChat shows Twitch's own copy, at the path the
  bridge sends.
- **State:** pairings, which messages were relayed as which, and which notifications were handled
  are kept in DynamoDB, in the same kind of table as the other bridges'. They can share a table, as
  their keys don't overlap. Without a table, state is kept in memory and lost on restart.
- **Reliability:**
  - OpenChat retries a notification the bridge fails to relay, and the bridge drops one it has
    already handled.
  - Messages are relayed into OpenChat with ids derived from their Twitch ids, so a repeated event
    can't post a message twice.
- **Throughput:** up to 32 messages are relayed into OpenChat at once, so a busy chat doesn't hold
  up everyone else's.
  - Messages sent within a moment of each other can arrive in OpenChat out of order.
  - Deletions don't wait behind messages. A message deleted on Twitch while it's being relayed is
    deleted in OpenChat once it arrives.
  - A message that waited over a minute to be relayed is dropped, as are new ones while 2,000
    wait, which only chats far busier than the bridge can keep up with would cause.

## Not yet

- **Edits.** Twitch messages can't be edited, so OpenChat's edits aren't relayed.
- **Only text is relayed.**
  - Twitch's emotes arrive as their names, and GIFs as links.
  - OpenChat's media become links to OpenChat's copies.
- **Not relayed:**
  - reactions, threads, and OpenChat's private channels, whose messages OpenChat doesn't send
    bots;
  - other channels' messages in a Shared Chat session, as they haven't agreed to the bridge.
- **Mentions** are relayed as `@name` text. On Twitch, that highlights the message for any Twitch
  user of that name.
- **Clearing a user's messages** after a ban or timeout only reaches those the bridge has seen
  since it started, up to its last 500 per channel.
- **The bot losing moderator or VIP status** while it's sending fast in a chat could still put it
  over Twitch's limits with its next message there, before it learns of it. Twitch would then
  ignore it for an hour in chats where it isn't a moderator or VIP.

## Setting it up

1. **A Twitch app,** at <https://dev.twitch.tv/console/apps>:
   - **OAuth redirect URL:** `{PUBLIC_URL}/oauth/callback`.
   - **Category:** Chat Bot.
   - **Client type:** Confidential.
   - Note its client id, and make a client secret.
   - Use a separate app for each deployment, eg. one for testing. The bridge uses the app's first
     EventSub conduit.

2. **A Twitch account for the bot,** eg. `OpenChatBridge`. This is the name viewers see its messages
   under.
   - Verify its email and phone number, as some channels require them to chat.
   - The bridge doesn't need its password or tokens. Instead, once the bridge is running, sign in as
     the bot at `{PUBLIC_URL}/authorize-bot`. This grants the app `user:bot`, `user:read:chat`,
     `user:write:chat` and `moderator:manage:chat_messages` for the account. It's the only manual
     sign-in the bot needs, unless the authorization is revoked.

3. **An identity for the OpenChat bot,** made with dfx. Keep it secret, as it's what lets the
   bridge act as the bot. dfx's default storage keeps it encrypted in your keychain.

   ```bash
   dfx identity new twitch_bot
   ```

   Its principal, to register the bot with:

   ```bash
   dfx identity get-principal --identity twitch_bot
   ```

   The bridge takes the identity as `OC_IDENTITY_PEM`, which dfx exports:

   ```bash
   dfx identity export twitch_bot
   ```

4. **Register the bot on OpenChat:**
   - Use the endpoint `PUBLIC_URL` and the identity's principal. OpenChat reads the bot's definition
     from `{PUBLIC_URL}/bot_definition`.
   - Then a platform operator makes it the Twitch bridge bot, on the */admin* page (`set_bridge_bot`).
     Until then, OpenChat refuses its relayed messages.
   - OpenChat's canisters and website must support Twitch first
     ([open-chat#10214](https://github.com/open-chat-labs/open-chat/pull/10214)).

5. **A DynamoDB table:** the other bridges' `oc-bridges` table will do. Otherwise:
   - **Partition key:** the string attribute `k`.
   - **TTL:** enabled on the attribute `ttl`.
   - **Permissions:** the bridge needs `dynamodb:GetItem`, `PutItem` and `DeleteItem` on the table.

6. **Run the container,** built from `rs/`:

   ```bash
   docker build -f offchain/bridges/twitch/Dockerfile -t oc-twitch-bridge .
   ```

   It serves OpenChat's requests and Twitch's sign-ins on `PORT`, which must be reachable at
   `PUBLIC_URL` over HTTPS. It holds a WebSocket to Twitch, so it runs on a host that stays up rather
   than on Lambda. It's meant to run beside the Discord bridge, on its EC2 instance
   `i-0198f9d466e519454`:
   - **Service:** a systemd unit `oc-twitch-bridge`, set up like `oc-discord-bridge`. As it starts,
     it pulls the image `oc-twitch-bridge:latest` from ECR, writes the config from SSM Parameter
     Store's `/oc-twitch-bridge/*` to `/run`, and runs the image as the container
     `oc-twitch-bridge`.
   - **Port:** 8081 on the host, admitted only from CloudFront, as 8080 is for the Discord bridge.
   - **Public URL:** a CloudFront distribution of its own in front of that port, uncached, with a
     60s origin timeout. OpenChat reads a bot's definition from its endpoint's root, so the two
     bridges can't share one distribution.
   - **Logs:** CloudWatch, in `/oc/twitch-bridge`.
   - **Permissions:** the instance's role also needs to read `/oc-twitch-bridge/*` and pull from the
     `oc-twitch-bridge` ECR repository.

   If the bridge stops, systemd can restart it at once. Unlike Discord, Twitch doesn't limit how
   often it connects.

   **Deploys** are done by the *Deploy Twitch bridge* GitHub Actions workflow
   ([`deploy-twitch-bridge.yaml`](../../../../.github/workflows/deploy-twitch-bridge.yaml)),
   run by hand from `main`:
   - It builds the image, pushes it to ECR tagged `latest` and with the commit, and restarts the
     service through SSM. The config in Parameter Store stays as it is.
   - If the bridge doesn't start, or doesn't stay up for 30 seconds, the deploy fails, and systemd
     keeps restarting it.
   - It then checks the bridge answers at the `PUBLIC_URL` in Parameter Store, which can be a String
     or a SecureString. A SecureString encrypted with a key of your own needs `kms:Decrypt` on the
     key too.
   - It deploys with the IAM role `GitHubActions-DeployTwitchBridge`, which GitHub can assume only
     from `main`:
     - **Trust:** the OIDC provider `token.actions.githubusercontent.com`, with `aud`
       `sts.amazonaws.com` and `sub` `repo:open-chat-labs/open-chat-bots:ref:refs/heads/main`.
     - **Permissions:** pushing to the `oc-twitch-bridge` ECR repository, plus
       `ecr:GetAuthorizationToken`, `ssm:SendCommand` on this instance with the `AWS-RunShellScript`
       document, `ssm:GetCommandInvocation`, and `ssm:GetParameter` on `/oc-twitch-bridge/PUBLIC_URL`.
     - `AWS-RunShellScript` runs any command on the host as root, so the role can do anything there,
       including to the Discord bridge's service and config, as the Discord bridge's role can to
       this one's.

7. **Point the website at it:** build the website with
   `OC_TWITCH_BRIDGE_LINK_URL={PUBLIC_URL}/link?code={code}`, so the *Link Twitch* option can be
   used.

## Configuration

| Variable | |
|---|---|
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | The Twitch app's |
| `TWITCH_BOT_LOGIN` | The bot account's login, eg. `openchatbridge` |
| `PUBLIC_URL` | Where the bridge is served, for Twitch's sign-ins and the instructions it gives |
| `OC_IDENTITY_PEM` or `OC_IDENTITY_PEM_FILE` | The OpenChat bot's identity, as PEM text, eg. from `dfx identity export`, or a file |
| `DYNAMODB_TABLE` | Where state is kept. AWS credentials and region come from the environment. |
| `PORT` | Defaults to 8080 |
| `OC_IC_URL`, `OC_PUBLIC_KEY`, `OC_USER_INDEX` | Only to use an OpenChat other than mainnet's |
| `RUST_LOG` | Log level, eg. `info` (the default) or `oc_twitch_bridge=debug` |
