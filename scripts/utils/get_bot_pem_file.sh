#!/bin/bash

IDENTITY=$1 # The identity of the bot

# Get the PEM file for the bot identity
PEM=$(dfx identity export $IDENTITY) || exit 1

# Remove carriage returns
PEM="${PEM//$'\r'/}"

# Replace newlines with \n
PEM="${PEM//$'\n'/\\n}"

echo $PEM