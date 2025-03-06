#!/bin/bash

# Capture the directory this script is in
SCRIPT=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$SCRIPT")

BOT=$1

# Change current directory back to rs folder
cd $SCRIPT_DIR/../..

# Create a canister for the bot locally
dfx canister create --quiet $BOT --no-wallet || exit 1

# Get the canister ID
CANISTER_ID=$(dfx canister id $BOT) || exit 1

# Build the bot WASM
dfx build --quiet $BOT --check || exit 1

echo "$CANISTER_ID"