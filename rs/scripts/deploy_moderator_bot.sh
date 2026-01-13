#!/bin/bash

# Pre-requisites
#
# 1. The [OpenChat repo](https://github.com/open-chat-labs/open-chat) and the [bot SDK repo](https://github.com/open-chat-labs/open-chat-bots) should be cloned to the same parent folder.
# 2. OpenChat should be setup according to [these instructions](https://github.com/open-chat-labs/open-chat/blob/master/README.md) 
# 3. dfx has been started
# 4. You are using the desired DFX principal. See `dfx identity use --help` for more information.

# CD into the directory this script is installed in
SCRIPT=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$SCRIPT")
cd $SCRIPT_DIR

MODE=${1:-install} # MODE is either install, reinstall or upgrade
USER_INDEX_CANISTER_ID=${2:-none} 

# Read the OpenChat public key from the website
OC_PUBLIC_KEY=$(curl -s http://localhost:5001/public-key)

if [ $? -ne 0 ]; then
    echo "OpenChat is not running on http://localhost:5001"
    exit 1
fi

if [ $USER_INDEX_CANISTER_ID == "none" ]; then
    ARGS="(record { oc_public_key = \"$OC_PUBLIC_KEY\" })"
else
    ARGS="(record { oc_public_key = \"$OC_PUBLIC_KEY\"; user_index_canister_id = opt principal \"$USER_INDEX_CANISTER_ID\" })"
fi

# Deploy the moderator_bot with the given MODE and ARGS
./utils/deploy_bot.sh moderator_bot ModeratorBot $MODE "$ARGS"