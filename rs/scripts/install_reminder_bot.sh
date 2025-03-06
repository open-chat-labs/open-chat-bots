#!/bin/bash

# Pre-requisites
#
# 1. The [OpenChat repo](https://github.com/open-chat-labs/open-chat) and the [bot SDK repo](https://github.com/open-chat-labs/open-chat-bots) should be cloned to the same parent folder.
# 2. OpenChat should be setup according to [these instructions](https://github.com/open-chat-labs/open-chat/blob/master/README.md) 
# 3. dfx has been started
# 4. You are using the desired DFX principal. See `dfx identity use --help` for more information.

# Capture the directory this script is installed in and backup to rs
SCRIPT=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$SCRIPT")
cd $SCRIPT_DIR/..

# Create a new canister for the reminder_bot and build its WASM
CANISTER_ID=$(./scripts/utils/create_and_build_bot.sh reminder_bot) || exit 1

# Extract the OpenChat public key from the user_index
OC_PUBLIC_KEY=$(./scripts/utils/extract_oc_public_key.sh) || exit 1

# Install the reminder_bot canister
dfx canister install --quiet --mode install reminder_bot --argument "(variant { Init = record { oc_public_key = \"$OC_PUBLIC_KEY\" } } )" || exit 1

# Return the URL of the reminder_bot
echo ""
echo "The reminder_bot has been installed and has the following endpoint:"
echo ""
echo "http://$CANISTER_ID.raw.localhost:8080"
echo ""
