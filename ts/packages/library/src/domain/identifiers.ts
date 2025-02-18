export type ChatIdentifier = MultiUserChatIdentifier | DirectChatIdentifier;
export type MultiUserChatIdentifier = ChannelIdentifier | GroupChatIdentifier;
export type DirectChatIdentifier = {
    kind: "direct_chat";
    userId: string;
};
export type GroupChatIdentifier = {
    kind: "group_chat";
    groupId: string;
};

export type ChannelIdentifier = {
    kind: "channel";
    communityId: string;
    channelId: number;
};
export type CommunityIdentifier = {
    kind: "community";
    communityId: string;
};
