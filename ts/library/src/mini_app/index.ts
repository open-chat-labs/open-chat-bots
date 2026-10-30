// The SDK's browser entry, `@open-ic/openchat-botclient-ts/mini_app`, for the app a bot opens from its
// MiniApp card. It has no Node dependencies.
export {
    MINI_APP_TOKEN_HEADER,
    MiniAppClient,
    connectToOpenChat,
    tokenExpiry,
    type ConnectOptions,
    type MiniAppMessageEvent,
    type MiniAppRole,
    type MiniAppStartResult,
    type MiniAppState,
    type MiniAppToOpenChat,
    type MiniAppWindow,
    type OpenChatToMiniApp,
} from "./client";
