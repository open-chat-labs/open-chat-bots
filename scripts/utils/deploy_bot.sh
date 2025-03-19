#!/bin/bash

# Capture the directory this script is installed in and cd into the rs folder
SCRIPT=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$SCRIPT")
cd $SCRIPT_DIR/../../rs

BOT=$1
NAME=$2
MODE=$3
ARGS=$4

if [ $MODE = "install" ]
then
    # Create a canister for the bot locally
    dfx canister create --quiet $BOT --no-wallet || exit 1
fi

# Get the canister ID
CANISTER_ID=$(dfx canister id $BOT) || exit 1

# Build the bot WASM
dfx build --quiet $BOT --check || exit 1

# Install/reinstall/upgrade the $BOT canister
dfx canister install --quiet --mode $MODE $BOT --argument "$ARGS" || exit 1

# Return the URL of the $BOT
echo ""
echo "Name: $NAME"
echo "Principal: $CANISTER_ID"
echo "Endpoint: http://$CANISTER_ID.raw.localhost:8080"
echo ""
