#!/bin/bash

# eg './upload_jokes.sh "/Users/myusername/.config/dfx/identity/myidentity/identity.pem" "/Users/myusername/Downloads/shortjokes.csv" "g6z42-4eaaa-aaaaa-qaata-cai"'

PEM_FILE=${1}
FILE_PATH=${2}
CANISTER_ID=${3}

SCRIPT=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$SCRIPT")
cd $SCRIPT_DIR/..

cargo run \
  --manifest-path examples/greet/loader/Cargo.toml -- \
  --greet-bot-canister-id $CANISTER_ID \
  --url http://127.0.0.1:8080/ \
  --pem-file $PEM_FILE \
  --file-path $FILE_PATH