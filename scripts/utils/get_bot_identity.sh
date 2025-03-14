#!/bin/bash

IDENTITY=$1 # The identity of the bot

# Try to get the principal for the bot identity
PRINCIPAL=$(dfx identity --identity $IDENTITY get-principal 2> /dev/null)

if [ $? -ne 0 ]; then
    # The identity does not exist, so create it
    dfx identity new $IDENTITY --storage-mode=plaintext || exit 1

    # Get the principal for the new identity
    PRINCIPAL=$(dfx identity --identity $IDENTITY get-principal) || exit 1
fi

echo $PRINCIPAL