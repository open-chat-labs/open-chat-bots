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

if [[ $MODE = "install" ]] || [[ $MODE = "reinstall" ]]
then
    # Read the OpenChat public key from the website
    OC_PUBLIC_KEY=$(curl -s http://localhost:5001/public-key) || exit 1

    # Get the principal of the current DFX identity
    ADMINISTRATOR_PRINCIPAL=$(dfx identity get-principal)
elif [ $MODE != "upgrade" ]
then
    echo "MODE must be either install, reinstall or upgrade"
    exit 1
fi

# Deploy the greet_bot with the given MODE and ARGS
./utils/deploy_bot.sh moderator_bot ModeratorBot $MODE "()"