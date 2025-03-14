#!/bin/bash

SCRIPT=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$SCRIPT")
cd $SCRIPT_DIR

IDENTITY=${1:-llama_bot} # The identity to use for the bot. This must be different for each offchain bot.
PORT=${2:-4000} # The port the bot will listen on

# The local IC URL
IC_URL=http://127.0.0.1:8080

# Query the OpenChat user_index canister for the OpenChat public key
OC_PUBLIC_KEY=$(./utils/get_oc_public_key.sh) || exit 1

# Get the principal for the bot identity creating it if it does not exist
PRINCIPAL=$(./utils/get_bot_identity.sh $IDENTITY) || exit 1

# CD into the DiceBot directory
cd ../rs/offchain/examples/llama || exit 1

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

# The port the bot will listen for commands on
port = $PORT

# Set the appropriate log level you'd like to record. Logs are recorded by the
# 'tracing' crate. Alowed values: trace, debug, info, warn, error.
log_level = "info"
EOF

# Build the bot
cargo build --release

echo ""
echo "Name: LlamaBot"
echo "Principal: $PRINCIPAL"
echo "Endpoint: http://localhost:$PORT"
echo ""

# Run the bot - the process won't exit until the bot is stopped
cargo run --release