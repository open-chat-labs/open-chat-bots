# The bot to deploy
BOT=$1

# Get the OpenChat public key
OC_PUBLIC_KEY=$(curl -s https://oc.app/public-key)

if [ $? -ne 0 ]; then
    echo "OpenChat is not running on https://oc.app/public-key."
    exit 1
fi

# Deploy the bot
dfx deploy --ic $BOT --argument "(\"$OC_PUBLIC_KEY\")" || exit 1

# Get the canister ID
CANISTER_ID=$(dfx canister --ic id $BOT) || exit 1

echo ""
echo "Principal: $CANISTER_ID"
echo "Endpoint: https://$CANISTER_ID.raw.icp0.io"
echo ""
