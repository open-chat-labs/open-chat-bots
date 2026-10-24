#!/bin/bash

SCRIPT=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$SCRIPT")
cd $SCRIPT_DIR

IDENTITY=${1:-chart_bot} # The identity to use for the bot. This must be different for each offchain bot.
PORT=${2:-3002} # The port the bot will listen on

# The local IC URL
IC_URL=http://127.0.0.1:8080

# Read the OpenChat public key from the website
OC_PUBLIC_KEY=$(curl -s http://localhost:5001/public-key) || exit 1

# The local StorageIndex, which the charts are uploaded to. The open-chat repo is cloned beside this one.
STORAGE_INDEX=$(cd ../../../open-chat && dfx canister id storage_index) || exit 1

# Get the principal for the bot identity creating it if it does not exist
PRINCIPAL=$(./utils/get_bot_identity.sh $IDENTITY) || exit 1

# Build the bot
cargo build --release -p oc_chart_bot || exit 1

echo ""
echo "Name: ChartBot"
echo "Principal: $PRINCIPAL"
echo "Endpoint: http://localhost:$PORT"
echo ""

# Run the bot - the process won't exit until the bot is stopped
OC_IDENTITY_PEM="$(dfx identity export $IDENTITY)" \
OC_IC_URL=$IC_URL \
OC_PUBLIC_KEY="$OC_PUBLIC_KEY" \
OC_STORAGE_INDEX=$STORAGE_INDEX \
PORT=$PORT \
cargo run --release -p oc_chart_bot
