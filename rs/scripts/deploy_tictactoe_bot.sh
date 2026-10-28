#!/bin/bash

SCRIPT=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$SCRIPT")
cd $SCRIPT_DIR

IDENTITY=${1:-tictactoe_bot} # The identity to use for the bot. This must be different for each offchain bot.
PORT=${2:-3100} # The port the bot will listen on
# The local UserIndex, where the bot looks up the user id OpenChat gives it when it's registered.
# By default it's read from the OpenChat repo, cloned next to this one.
USER_INDEX_CANISTER_ID=${3:-$(cd ../../../open-chat 2>/dev/null && dfx canister id user_index 2>/dev/null)}

if [ -z "$USER_INDEX_CANISTER_ID" ]; then
    echo "Couldn't find the local UserIndex. Pass its canister id as the third argument."
    exit 1
fi

# The local IC URL
IC_URL=http://127.0.0.1:8080

# Read the OpenChat public key from the website
OC_PUBLIC_KEY=$(curl -s http://localhost:5001/public-key) || exit 1

# Get the principal for the bot identity creating it if it does not exist
PRINCIPAL=$(./utils/get_bot_identity.sh $IDENTITY) || exit 1

# CD into the TicTacToeBot directory
cd ../offchain/examples/tictactoe || exit 1

# Extract the PEM file for the bot identity
$(dfx identity export $IDENTITY > bot.pem) || exit 1

# Create the config.toml
cat > config.toml <<EOF
# The PEM file containing the private key the bot will use to sign requests to the IC
pem_file = "bot.pem"

# [optional]
# The url of the Internet Computer instance the bot is targeting.
# If not specified the mainnet IC url will be used.
ic_url = "$IC_URL"

# [optional]
# Public key component of the key used by OpenChat to sign the issued JWTs. This value
# can be obtained from the OC UI by visiting User Profile -> Advanced -> Bot client config.
# If not specified the mainnet OC public key will be used.
oc_public_key = "$OC_PUBLIC_KEY"

# [optional]
# The UserIndex canister, where the bot looks up the user id OpenChat gave it when it was
# registered. If not specified the mainnet UserIndex will be used.
user_index_canister_id = "$USER_INDEX_CANISTER_ID"

# The port the bot will listen for commands and button presses on
port = $PORT
EOF

# Build the bot
cargo build --release

echo ""
echo "Name: TicTacToeBot"
echo "Principal: $PRINCIPAL"
echo "Endpoint: http://localhost:$PORT"
echo ""

# Run the bot - the process won't exit until the bot is stopped
cargo run --release