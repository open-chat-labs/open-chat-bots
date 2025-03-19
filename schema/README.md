# Bot Definition Schema

When you create an OpenChat bot, whether it is hosted in an IC canister or as an off-chain server, it must provide up to date metadata about its purpose and the commands it provides (including their arguments and the OpenChat permissions they require). This is referred to as the bot's _definition_.

The bot definition _must_ be returned when a GET request is made to the path "/bot_definition" of your bot's endpoint.

The response that your bot makes to this GET request _must_ conform to the JSON schema defined [here](./bot_schema.json).

When you register a bot using the `/register_bot` command, OpenChat will query the bot endpoint for the definition and ensure that it is valid. You will also be able to browse through the definition in the OpenChat UI at that point to double check that everything looks correct.

As your bot implementation changes over time you _must_ make sure that your definition remains up to date and correct. When the definition changes, you must also tell OpenChat that it has changed using the `/update_bot` command within OpenChat. This allows OpenChat to load and validate the new definition. It is very important that this is kept up to date because it controls how OpenChat will present the capabilities and requirements of your bot to OpenChat community owners and users.
