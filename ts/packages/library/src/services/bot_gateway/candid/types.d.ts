import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface AudioContent {
  'mime_type' : string,
  'blob_reference' : [] | [BlobReference],
  'caption' : [] | [string],
}
export type AuthToken = { 'Jwt' : string } |
  { 'ApiKey' : string };
export interface BlobReference {
  'blob_id' : bigint,
  'canister_id' : CanisterId,
}
export type BotApiCallError = { 'Invalid' : string } |
  {
    'CanisterError' : { 'NotAuthorized' : null } |
      { 'Other' : string } |
      { 'Frozen' : null }
  } |
  { 'C2CError' : [number, string] };
export interface BotSendMessageArgs {
  'channel_id' : [] | [ChannelId],
  'content' : MessageContent,
  'auth_token' : AuthToken,
  'block_level_markdown' : boolean,
  'finalised' : boolean,
  'message_id' : [] | [MessageId],
}
export type BotSendMessageResponse = { 'ThreadNotFound' : null } |
  { 'NotAuthorized' : null } |
  { 'Success' : SuccessResult } |
  { 'InvalidRequest' : string } |
  { 'MessageAlreadyFinalised' : null } |
  { 'C2CError' : [number, string] } |
  { 'Frozen' : null };
export type CanisterId = Principal;
export type ChannelId = number;
export type EventIndex = number;
export interface FileContent {
  'name' : string,
  'mime_type' : string,
  'file_size' : number,
  'blob_reference' : [] | [BlobReference],
  'caption' : [] | [string],
}
export interface GiphyContent {
  'title' : string,
  'desktop' : GiphyImageVariant,
  'caption' : [] | [string],
  'mobile' : GiphyImageVariant,
}
export interface GiphyImageVariant {
  'url' : string,
  'height' : number,
  'mime_type' : string,
  'width' : number,
}
export interface ImageContent {
  'height' : number,
  'mime_type' : string,
  'blob_reference' : [] | [BlobReference],
  'thumbnail_data' : string,
  'caption' : [] | [string],
  'width' : number,
}
export type MessageContent = { 'Giphy' : GiphyContent } |
  { 'File' : FileContent } |
  { 'Poll' : PollContent } |
  { 'Text' : TextContent } |
  { 'Image' : ImageContent } |
  { 'Audio' : AudioContent } |
  { 'Video' : VideoContent };
export type MessageId = bigint;
export type MessageIndex = number;
export interface PollConfig {
  'allow_multiple_votes_per_user' : boolean,
  'text' : [] | [string],
  'show_votes_before_end_date' : boolean,
  'end_date' : [] | [TimestampMillis],
  'anonymous' : boolean,
  'allow_user_to_change_vote' : boolean,
  'options' : Array<string>,
}
export interface PollContent {
  'votes' : PollVotes,
  'ended' : boolean,
  'config' : PollConfig,
}
export interface PollVotes {
  'total' : TotalPollVotes,
  'user' : Uint32Array | number[],
}
export interface SuccessResult {
  'timestamp' : TimestampMillis,
  'message_id' : MessageId,
  'event_index' : EventIndex,
  'expires_at' : [] | [TimestampMillis],
  'message_index' : MessageIndex,
}
export interface TextContent { 'text' : string }
export type TimestampMillis = bigint;
export type TotalPollVotes = { 'Anonymous' : Array<[number, number]> } |
  { 'Visible' : Array<[number, Array<UserId>]> } |
  { 'Hidden' : number };
export type UserId = CanisterId;
export interface VideoContent {
  'height' : number,
  'image_blob_reference' : [] | [BlobReference],
  'video_blob_reference' : [] | [BlobReference],
  'mime_type' : string,
  'thumbnail_data' : string,
  'caption' : [] | [string],
  'width' : number,
}
export interface _SERVICE {
  'bot_send_message' : ActorMethod<
    [BotSendMessageArgs],
    BotSendMessageResponse
  >,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
