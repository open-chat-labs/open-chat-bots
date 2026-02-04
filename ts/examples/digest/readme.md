# Digest bot

The purpose of this bot is to demonstrate the integration of an AI agent with bot SDK capabilities. This allows us to use the AI for what it is good at i.e. parsing intent and parameters from the user's prompt and the bot sdk for what _it_ is good at i.e. taking the parsed intent and parameters and interacting with the OC backend.

In order to do this we present the AI with tools that it can use to fullfill the user's prompt. These tools are essentially function wrappers that expose relevant bot sdk functions.

In this particular case the user can ask, in natural language, for a summary of the last n messages in a specific chat. This prompt will be passed on to the AI with a tool that tells the AI how to load the most recent n messages from OpenChat.

The AI will then parse out the params and ask us to call that tool. We then pass the result back into the AI and ask it to summarise the content.

This is a powerful technique that can help simplify complicated or fiddly command structures and allow us to simply expose a straightforward prompt interface to our users.
