# Pre-requisites
#
# 1. The [OpenChat repo](https://github.com/open-chat-labs/open-chat) and the [bot SDK repo](https://github.com/open-chat-labs/open-chat-bots) should be cloned to the same parent folder.
# 2. OpenChat should be setup according to [these instructions](https://github.com/open-chat-labs/open-chat/blob/master/README.md) 
# 3. dfx has been started

# Capture the directory this script is in
SCRIPT=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$SCRIPT")

# Change directory to the OpenChat repo
cd $SCRIPT_DIR/../../../open-chat

# Call the local OpenChat user_index to get the OpenChat public key
RESULT=$(dfx canister call -qq user_index public_key '(record { })') || exit 1

# Use parameter expansion with substring removal to extract the public key
first_part="${RESULT#*-----BEGIN PUBLIC KEY-----}"  # Remove everything up to and including the first "---"
second_part="${first_part%-----END PUBLIC KEY-----*}" # Remove everything from the last "---" to the end
OC_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----$second_part-----END PUBLIC KEY-----\n"

# Change directory back to the rs folder
cd $SCRIPT_DIR/../../rs

# Echo the public key
echo "$OC_PUBLIC_KEY"

