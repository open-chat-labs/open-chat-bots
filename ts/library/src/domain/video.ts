export type VideoCall = {
    messageIndex: number;
    callType: VideoCallType;
};

export type VideoCallType = "default" | "broadcast";
