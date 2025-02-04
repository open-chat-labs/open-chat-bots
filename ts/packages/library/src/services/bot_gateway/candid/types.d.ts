import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export type AccessGate = { 'UniquePerson' : null } |
  { 'VerifiedCredential' : VerifiedCredentialGate } |
  { 'ReferredByMember' : null } |
  { 'SnsNeuron' : SnsNeuronGate } |
  { 'Locked' : null } |
  { 'TokenBalance' : TokenBalanceGate } |
  {
    'Composite' : { 'and' : boolean, 'inner' : Array<AccessGateNonComposite> }
  } |
  { 'DiamondMember' : null } |
  { 'Payment' : PaymentGate } |
  { 'LifetimeDiamondMember' : null };
export interface AccessGateConfig {
  'gate' : AccessGate,
  'expiry' : [] | [Milliseconds],
}
export type AccessGateNonComposite = { 'UniquePerson' : null } |
  { 'VerifiedCredential' : VerifiedCredentialGate } |
  { 'ReferredByMember' : null } |
  { 'SnsNeuron' : SnsNeuronGate } |
  { 'Locked' : null } |
  { 'TokenBalance' : TokenBalanceGate } |
  { 'DiamondMember' : null } |
  { 'Payment' : PaymentGate } |
  { 'LifetimeDiamondMember' : null };
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
export interface BotCreateChannelArgs {
  'is_public' : boolean,
  'permissions' : [] | [GroupPermissions],
  'gate_config' : [] | [AccessGateConfig],
  'auth_token' : AuthToken,
  'external_url' : [] | [string],
  'name' : string,
  'description' : string,
  'events_ttl' : [] | [Milliseconds],
  'messages_visible_to_non_members' : boolean,
  'history_visible_to_new_joiners' : boolean,
  'rules' : Rules,
  'avatar' : [] | [Document],
}
export type BotCreateChannelResponse = { 'NotAuthorized' : null } |
  { 'Success' : { 'channel_id' : ChannelId } } |
  { 'InvalidRequest' : string } |
  { 'C2CError' : [number, string] } |
  { 'Frozen' : null };
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
  {
    'Success' : {
      'timestamp' : TimestampMillis,
      'message_id' : MessageId,
      'event_index' : EventIndex,
      'expires_at' : [] | [TimestampMillis],
      'message_index' : MessageIndex,
    }
  } |
  { 'InvalidRequest' : string } |
  { 'MessageAlreadyFinalised' : null } |
  { 'C2CError' : [number, string] } |
  { 'Frozen' : null };
export type CanisterId = Principal;
export type ChannelId = number;
export interface CustomPermission {
  'subtype' : string,
  'role' : PermissionRole,
}
export interface Document {
  'id' : bigint,
  'data' : Uint8Array | number[],
  'mime_type' : string,
}
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
export interface GroupPermissions {
  'mention_all_members' : PermissionRole,
  'delete_messages' : PermissionRole,
  'remove_members' : PermissionRole,
  'update_group' : PermissionRole,
  'message_permissions' : MessagePermissions,
  'invite_users' : PermissionRole,
  'thread_permissions' : [] | [MessagePermissions],
  'change_roles' : PermissionRole,
  'start_video_call' : PermissionRole,
  'add_members' : PermissionRole,
  'pin_messages' : PermissionRole,
  'react_to_messages' : PermissionRole,
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
export interface MessagePermissions {
  'audio' : [] | [PermissionRole],
  'video' : [] | [PermissionRole],
  'video_call' : [] | [PermissionRole],
  'custom' : Array<CustomPermission>,
  'file' : [] | [PermissionRole],
  'poll' : [] | [PermissionRole],
  'text' : [] | [PermissionRole],
  'crypto' : [] | [PermissionRole],
  'giphy' : [] | [PermissionRole],
  'default' : PermissionRole,
  'image' : [] | [PermissionRole],
  'prize' : [] | [PermissionRole],
  'p2p_swap' : [] | [PermissionRole],
}
export type Milliseconds = bigint;
export interface PaymentGate {
  'fee' : bigint,
  'ledger_canister_id' : CanisterId,
  'amount' : bigint,
}
export type PermissionRole = { 'None' : null } |
  { 'Moderators' : null } |
  { 'Owner' : null } |
  { 'Admins' : null } |
  { 'Members' : null };
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
export interface Rules { 'text' : string, 'enabled' : boolean }
export interface SnsNeuronGate {
  'min_stake_e8s' : [] | [bigint],
  'min_dissolve_delay' : [] | [Milliseconds],
  'governance_canister_id' : CanisterId,
}
export interface TextContent { 'text' : string }
export type TimestampMillis = bigint;
export interface TokenBalanceGate {
  'min_balance' : bigint,
  'ledger_canister_id' : CanisterId,
}
export type TotalPollVotes = { 'Anonymous' : Array<[number, number]> } |
  { 'Visible' : Array<[number, Array<UserId>]> } |
  { 'Hidden' : number };
export type UserId = CanisterId;
export interface VerifiedCredentialGate {
  'credential_arguments' : Array<
    [string, { 'Int' : number } | { 'String' : string }]
  >,
  'issuer_origin' : string,
  'issuer_canister_id' : CanisterId,
  'credential_name' : string,
  'credential_type' : string,
}
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
  'bot_create_channel' : ActorMethod<
    [BotCreateChannelArgs],
    BotCreateChannelResponse
  >,
  'bot_send_message' : ActorMethod<
    [BotSendMessageArgs],
    BotSendMessageResponse
  >,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
