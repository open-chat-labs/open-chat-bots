#!/bin/bash

# Capture the directory this script is installed in and backup to rs
SCRIPT=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$SCRIPT")
cd $SCRIPT_DIR/..

BOT=$1
MODE=$2
ARGS=$3

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
echo "Deployment complete. The $BOT has the following endpoint:"
echo ""
echo "http://$CANISTER_ID.raw.localhost:8080"
echo ""
