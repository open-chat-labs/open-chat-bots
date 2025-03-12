# Install and test the example bots

This is a guide to get the example bots up and running as a starting point for developing your own bot.

## Prerequisites

Ensure the `open-chat-labs` and `open-chat` repos are cloned into the same root directory:

```
open-chat-labs/
   |_open-chat
   |_open-chat-bots
```

## Step 1: Setup OpenChat Locally

1. Setup OpenChat locally by following the instructions in the [README](https://github.com/open-chat-labs/open-chat/blob/master/README.md)

2. Run OpenChat in a browser with `http://localhost:5001/`

You'll see the OpenChat frontend:

![Open chat frontend](./images/open-chat-frontend.png)

### Step 2: Create Account and Test Group

1. Signup and create an account

2. Create a private group for testing:
   - Click "Create a new group":
     ![Create a group on open chat](./images/create-group.png)
   - Enter the group name:
     ![Group names](./images/GroupName.png)
   - Click "next" until you reach the "Create Group" button:
     ![Create group](./images/creategroup.png)

### Step 3: Deploy the Bot

To deploy the example bots for particular SDKs please follow these links:

- Canister bots
  - [Rust](./rs/canister/README.md)
  - [Motoko](./rs/motoko/README.md) (coming soon)
- Off-chain bots
  - [Typescript](./ts/README.md)
  - [Rust](./rs/offchain/README.md)

### Step 4: Register the Bot

1. From your test group on the local OpenChat website enter `/register_bot` and fill in the fields

2. Use the bot canister id from the endpoint URL in Step 3 as the principal

3. This registers the bot on OpenChat for testing but it still needs to be installed into a group, community, or as a direct chat

![Register bot](./images/register-onchain-bot.png)

### Step 5: Add Bot to Group

1. Open the group members in the right panel

2. Look for the "Add bots" tab

![add bots](./images/add-bots.png)

3. Select the newly registered bot and install it

![install bot](./images/install-bot.png)

You can now run the various bot commands it provides!
