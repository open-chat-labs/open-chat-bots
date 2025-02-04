# OpenChat bot client javascript / typescript library

This library provides the necessary functionality to process commands sent from the OpenChat front
end to an off-chain bot written in javascript or typescript.

This includes the parsing of the authorising json web token (jwt) which will be sent with each
request and managing the interactions between the bot and the OpenChat back end.

For a sample implementation of a simple typescript bot see the ./example directory in this
repository. This demonstrates a simple bot which provides search access to the Spotify api and
sends messages to the OpenChat backend with the results.

## Installation

To install this library, run the following command in the root of your bot project:

```bash
npm i @open-ic/openchat-botclient-ts
```

## Initialisation

The library exports a `BotClientFactory` constructor which is designed to be created when your bot starts up. This will be given a number of pieces of environment specific configuration which are necessary to construct a valid client to talk to the OpenChat backend.

This client factory exposes two methods `createClientFromJwt` and `createClientFromApiKey` depending on whether you are respondind to a command or using an API key.

One ideomatic pattern to work with is to use express middleware to create the right kind of client and attach it to the request object so that it is available to downstream route handlers.

For an example of this you can refer to [the middleware](./packages/example/src/middleware/botclient.ts) used in the sample implementation.

```typescript
const factory = new BotClientFactory({
  openchatPublicKey: process.env.OC_PUBLIC!,
  icHost: process.env.IC_HOST!,
  identityPrivateKey: process.env.IDENTITY_PRIVATE!,
  openStorageCanisterId: process.env.STORAGE_INDEX_CANISTER!,
});
```

We can see that there are some input arguments required to construct an instance of the `BotClientFactory`. Some of the values for the input arguments required here can be obtained by navigating to your user profile inside OpenChat (running in the target environment), opening the Advanced section and clicking on the "Bot client data" button. This will provide the OC public key, the OpenStorage index canister and the IC host url for your environment.

Let's briefly explain what each of these arguments are for:

### StorageIndexCanister

This is the canisterId of the OpenChat storage index. This is environment specific and will not change once you have it set up. You may decide to control this with an environment variable or simply hard code it to the value of the environment that you wish to use.

### ICHost

This is the the root host of the internet computer for the environment where you are operating. Again this only varies by the target IC environment.

### IdentityPrivateKey

This forms the basis of how the bot identifies itself to the OpenChat backend. When you _register_ an off-chain bot, you must specify a principal which the bot will identify itself with.

To obtain this principal, you can generate a pem file as follows:

```
openssl ecparam -genkey -name secp256k1 -out private_key.pem
```

Note that it is _very important_ that you do not leak the contents of that key. Do not commit it to source control etc. One good option is to pass the contents of the private key into your bot using an environment variable.

This private key will be passed into the BotClient and used (internally) to create an Identity (from which we can obtain a principal).

You will need to know the principal represented by the pem file you generated in order to register your bot. To find out what this principal will be you can use [this script](./packages/library/scripts/report_principal.js) as follows:

```
node ./scripts/report_principal.js <path-to-pem-file>
```

This will print the correct principal to the console.

### OpenChatPublicKey

To authorise the execution of bot commands a user requests an authorisation token from the OpenChat backend. If granted, OpenChat will sign this jwt token using it's own private key. The public key part of this key pair needs to be passed into the BotClient so that the BotClient can verify and decode the auth token. This is important because the auth token contains all of the context and arguments of the command to be executed. We need to be able to decode it and to be sure that it originated in the OpenChat system.

### EncodedJwt

In addition when creating an instance of _command_ client via `BotClientFactory.createClientFromJwt` you will also need to provide the encoded JWT auth token that you will find in the body of the request made to the bot's `execute_command` endpoint. This is a plain text value and just needs to be passed into the BotClientFactory function as is. The BotClientFactory will then use the OpenChat public key to decode and verify this token and, if valid, it will expose the relevant values that it contains for use throughout the lifespan of your bot request.

### API Key

In the case where we are using `BotClientFactory.createClientFromApiKey` you will need to pass in an API key instead. This API key will be provide in an `x-api-key` HTTP header.

## Command Usage

The easiest way to grasp the usage of the OpenChat BotClient is to look at one of the sample command handlers in the example bot implementation, for example [the album command](./packages/example/src/handlers/album.ts), which is commented for clarity.

This command is designed to capture a search term from the user, search Spotify for that album and send the result as a text message to the OpenChat backend. Let's review the steps it is taking:

#### Obtain a reference to the BotClient

Exactly how and when you contruct your instance of the BotClient and make it available to your handler code is up to you and may be dependent on framework. Perhaps you will be using some dependency injection framework. In our case, for simplicity, we are using an express js middleware to create the BotClient instance and it is simply appended to the incoming request. So the first step in our handler is to obtain a reference to the BotClient instance.

```typescript
const client = req.botClient;
```

#### Extract any necessary arguments

Your bots schema definition is used to express what arguments a command requires and their types. These arguments will all have been included in the encoded json web token supplied to the BotClient and it will have verified and decoded them on your behalf. So to access those arguments, you simply need to ask the client instance for them:

```typescript
const album = client.stringArg("album");
if (album === undefined) {
  res.status(400).send(argumentsInvalid());
}
```

Note that arguments are typed and named, so we ask specifically for a string argument with the name "album" in this case. Note that we must check that this argument actually exists after asking for it (this might be easily overlooked particularly if you are using javascript).

If we find that the argument does not exist then we cannot proceed and must return a 400 http response. We can also use the `argumentsInvalid` helper function exported by the library to structure this 400 response correctly.

Note that the _same_ client library is used regardless of whether you are responding to a command or using an API key. Keep in mind that the there will be no command if you have not initialised the library within a command context (with a jwt).

#### Send a placeholder response

It's likely that our bot will have some async work to do before interacting with the OpenChat backend. We don't want to leave our users hanging though so it a good idea to have our bot return _something_ as quickly as possible. This can just be a placeholder message to tell the user that the bot is busy fullfilling their command. In our case we want to use the placeholder "Searching Spotify ...".

We can either create a text message and send it to OpenChat in one go using the `sendTextMessage` method or we can create the message and send it in two steps using `createTextMessage` and passing the result to `sendMessage`. In this case we want to send the message both to the OpenChat backend and return it to the OpenChat frontend so we create the message explicitly to avoid creating the same message twice.

```typescript
const placeholder = await client.createTextMessage(
  false,
  "Searching Spotify ..."
);
client
  .sendMessage(placeholder)
  .catch((err) => console.error("sendTextMessage failed with: ", err));
```

The first parameter to the `createTextMessage` method is a `finalised` flag to tell OpenChat whether this is the final message associated with this command. Since it is just a placeholder, the finalised flag is set to false.

Having send the message to the OpenChat backend, we now send the same message back to the OpenChat _frontend_:

```typescript
res.status(200).json(success(placeholder));
```

There is no _requirement_ to use these placeholder messages but they are a good idea if you want to provide feedback to users (both the initiator of the command and other users) that something is happening.

Why do we send the same placeholder message to both the OpenChat backend and return it to the OpenChat frontend? Because this way we can get feedback to the initiator of the command _without having to wait for the message to be finalised in the OpenChat backend_ and without having to wait for the frontend event loop to load the confirmed message. Using this approach the message will appear as an unconfirmed message for the command initiator as soon as the bot command returns which is often the best user experience.

In some cases, the bot will be able to immediately respond with the _final_ message without performing any long running or asynchronous work. In this case it would simple set the finalised flag to `true` when creatin the text message (or other message variant).

#### Perform the bot's work

Assuming our bot _does_ have some work to do, we will now perform that work. In this case it involves hitting the Spotify api and searching for whatever the user has asked for. But your bot will probably be doing something completely different.

#### Sending further messages to the OpenChat backend

Once we have done our work and achieved some result, it is likely that we will want to communicate with the OpenChat backend again to update our message with the final result.

```typescript
client
  .sendTextMessage(true, url)
  .catch((err) => console.error("sendTextMessage failed with: ", err));
```

Note that in this case we are creating and sending the message all in one method call since we do not need to re-use the message created and we are setting the `finalised` flag to true since this is the final message that we expect to send to OpenChat for this command execution.

Note that each time we call `sendTextMessage` within the lifecycle of a single command execution we will be creating or updating the _same message_ within OpenChat.

Note also that it is always possible for the calls to the OpenChat back end to return error responses or to throw errors so you will need appropriate error handling. The typescript types will help you track the possible ways that a call to the OpenChat backend can fail.

## API key Usage

For an example usage of the API key method, take a look at the [executeAction](./packages/example/src/handlers/executeAction.ts) file. It is quite similar to the command case except there is no command for us to inspect in this case. Of course the third party system with which we are integrating may have sent data to us along with the request in any format it likes. In the case of our example we are simply relaying whatever is in the request body on as an OpenChat text message.

## BotClient interface

Here is a full description of the BotClient interface.

TBD
