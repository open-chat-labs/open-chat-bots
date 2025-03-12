# SDK for bots built in Rust

Here you can find the base rust SDK for building OpenChat bots with concrete SDKs for canister and offchain bots in their respective folders.

## Quick start

To get the example canister bots running, follow these steps:

1. Setup OpenChat locally by following the instructions here:
   https://github.com/open-chat-labs/open-chat/blob/master/README.md

2. Run OpenChat in a browser with `http://localhost:5001/`

3. Signup, create an account, and then create a private group for testing

4. Run `./scripts/deploy_greet_bot.sh install`. This will create a local canister, build the WASM, install it, then return the bot endpoint.

5. From your test group on the local OpenChat website enter `/register_bot` and fill in the fields. The principal is the bot canister id which you can see in the bot endpoint url from step 4. This registers the bot on OpenChat for testing but it still needs to be installed into a group or community, or as a direct chat to interact with it.

6. Once the greet bot is registered, open the group members in the right panel and you should see a tab "Add bots". Select the newly registered bot and go ahead and install it. You can now run the various bot commands it provides!
