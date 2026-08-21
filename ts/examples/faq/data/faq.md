# OpenChat FAQ (sample)

This file is a placeholder FAQ corpus used to seed the bot's vector index.
Replace or extend it with the real FAQ content you want the bot to answer from.

## What is OpenChat?

OpenChat is a fully decentralized chat platform built on the Internet Computer (ICP).
Every message, user, and community lives on-chain. Governance is handled by an SNS DAO,
and the platform has no central server operator.

## How do I get started on OpenChat?

Visit https://oc.app and sign in with an Internet Identity, an email passkey, or another
supported authentication option. Once signed in you can join communities, start direct
chats, and create your own groups.

## What are OpenChat bots?

OpenChat bots are off-chain or on-chain programs that can send and receive messages in
OpenChat chats on behalf of a bot principal. A bot is registered by publishing a bot
definition and associating it with a chat or community.

## What kinds of bots can I build?

There are three main kinds: command bots (triggered by a slash command), integration
bots (respond to webhooks or external events), and autonomous bots (subscribe to chat
events and react on their own).

## How does bot authentication work?

The OpenChat backend signs a short-lived JWT with its private key. Your bot verifies the
JWT with the OpenChat public key using the provided SDK. No additional secret sharing is
required on the bot side.

## How do I test a bot locally?

Run the OpenChat backend locally via the open-chat repository, then register your bot
with /register_bot in your local instance. Point the bot's OC_PUBLIC, IC_HOST, and
IDENTITY_PRIVATE env vars at the local setup.

## How do I publish a bot for real users?

Publishing a bot to the main OpenChat deployment requires an SNS DAO proposal that
approves the bot principal and its definition. Until the proposal passes, the bot can
still be used in private test communities.

## Where is the SDK for TypeScript bots?

The TypeScript bot client library lives under ts/library in the open-chat-bots repo and
is published as @open-ic/openchat-botclient-ts. See ts/examples for reference bots.
