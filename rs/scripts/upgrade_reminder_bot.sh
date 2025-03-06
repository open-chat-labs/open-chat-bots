#!/bin/bash

# Pre-requisites
#
# 1. You have already installed the reminder_bot by running the install_reminder_bot.sh script
# 2. dfx has been started
# 3. You are using the desired DFX principal. See `dfx identity use --help` for more information.

# Capture the directory this script is in
SCRIPT=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$SCRIPT")

# Change directory back up to the rs folder
cd $SCRIPT_DIR/..

# Build the reminder_bot WASM
dfx build reminder_bot --check || exit 1

# Upgrade the reminder_bot canister
dfx canister install --mode upgrade reminder_bot --argument "(variant { Upgrade = record {} } )" || exit 1
