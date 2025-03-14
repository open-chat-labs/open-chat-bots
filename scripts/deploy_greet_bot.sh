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
    # Extract the OpenChat public key from the user_index
    OC_PUBLIC_KEY=$(./utils/get_oc_public_key.sh) || exit 1

    # Get the principal of the current DFX identity
    ADMINISTRATOR_PRINCIPAL=$(dfx identity get-principal)

    # Build the greet_bot install args
    ARGS="(variant { Init = record { oc_public_key = \"$OC_PUBLIC_KEY\"; administrator = principal \"$ADMINISTRATOR_PRINCIPAL\" } } )"
elif [ $MODE = "upgrade" ]
then
    # Build the greet_bot upgrade args
    ARGS="(variant { Upgrade = record {} })"
else
    echo "MODE must be either install, reinstall or upgrade"
    exit 1
fi

# Deploy the greet_bot with the given MODE and ARGS
./utils/deploy_bot.sh greet_bot GreetBot $MODE "$ARGS"