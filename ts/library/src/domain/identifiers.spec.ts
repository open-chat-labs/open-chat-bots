/* eslint-disable @typescript-eslint/ban-ts-comment */
import { expect, test } from "vitest";
import {
    ChannelIdentifier,
    ChatIdentifier,
    DirectChatIdentifier,
    GroupChatIdentifier,
} from "./identifiers";

//@ts-ignore
BigInt.prototype.toJSON = function () {
    return this.toString();
};

//@ts-ignore
Uint8Array.prototype.toJSON = function () {
    return Array.from(this);
};

test("serialise group chat id", () => {
    const id = new GroupChatIdentifier("12345");
    const str = JSON.stringify(id);
    const newId = ChatIdentifier.fromJson(JSON.parse(str));
    expect(newId).instanceOf(GroupChatIdentifier);
    expect(newId.isGroupChat()).toBe(true);
});

test("serialise direct chat id", () => {
    const id = new DirectChatIdentifier("12345");
    const str = JSON.stringify(id);
    const newId = ChatIdentifier.fromJson(JSON.parse(str));
    expect(newId).instanceOf(DirectChatIdentifier);
    expect(newId.isDirectChat()).toBe(true);
});

test("serialise channel id", () => {
    const id = new ChannelIdentifier("12345", 12345n);
    const str = JSON.stringify(id);
    const newId = ChatIdentifier.fromJson(JSON.parse(str));
    expect(newId).instanceOf(ChannelIdentifier);
    expect(newId.isChannel()).toBe(true);
    if (newId.isChannel()) {
        expect(newId.communityId).toEqual("12345");
        expect(newId.channelId).toEqual(12345n);
    }
});
