#!/bin/bash

SCRIPT=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$SCRIPT")
cd $SCRIPT_DIR

IDENTITY=${1:-llama_bot} # The identity to use for the bot. This must be different for each offchain bot.
PORT=${2:-4000} # The port the bot will listen on

# Get the principal for the bot identity creating it if it does not exist
PRINCIPAL=$(./utils/get_bot_identity.sh $IDENTITY) || exit 1

# Get the PEM file for the bot identity
PEM=$(./utils/get_bot_pem_file.sh $IDENTITY) || exit 1

# The path to the bot config.toml
CONFIG_FILE="../rs/offchain/examples/llama/config.toml"

# Create the config.toml
cat > "$CONFIG_FILE" <<EOF
# The PEM file containing the private key the bot will use to sign requests to the IC
pem_file = "$PEM"

# [optional]
# The url of the Internet Computer instance the bot is targeting.
# If not specified the mainnet IC url will be used.
# ic_url = ""

# [optional]
# Public key component of the key used by OpenChat to sign the issued JWTs. This value
# can be obtained from the OC UI by visiting User Profile -> Advanced -> Bot client config.
# If not specified the mainnet OC public key will be used.
# oc_public_key = ""

# The port the bot will listen for commands on
port = $PORT

# Set the appropriate log level you'd like to record. Logs are recorded by the
# 'tracing' crate. Alowed values: trace, debug, info, warn, error.
log_level = "info"
EOF

# Build the bot
cd ../rs/offchain/examples/llama || exit 1
cargo build --release

echo ""
echo "Bot: LlamaBot"
echo "Principal: $PRINCIPAL"
echo ""

# Note the LlamaBot can currently only be run on mainnet because it calls the DFINITY Llama canister