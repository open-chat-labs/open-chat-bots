import { ChatActionScope } from "@open-ic/openchat-botclient-ts";

export function getMessageUrl(scope: ChatActionScope, messageIndex: string): string {
    if (scope.chat.isChannel()) {
        return `http://localhost:5001/community/${scope.chat.communityId}/channel/${scope.chat.channelId}/${messageIndex}`;
    } else if (scope.chat.isGroupChat()) {
        return `http://localhost:5001/chats/group/${scope.chat.groupId}/${messageIndex}`;
    } else if (scope.chat.isDirectChat()) {
        return `http://localhost:5001/chats/user/${scope.chat.userId}/${messageIndex}`;
    }
    return `unable to parse message ${messageIndex}`;
}
