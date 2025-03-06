# Pre-requisites
#
# This script assumes the [OpenChat repo](https://github.com/open-chat-labs/open-chat) and the [bot SDK repo](https://github.com/open-chat-labs/open-chat-bots) have been cloned to the same parent folder.
# And that OpenChat has been setup according to [these instructions](https://github.com/open-chat-labs/open-chat/blob/master/README.md) and dfx is running.

dfx canister create reminder_bot --no-wallet

CANISTER_ID=$(dfx canister --network $NETWORK id user_index)

dfx build --check reminder_bot