export const idlFactory = ({ IDL }) => {
  const PermissionRole = IDL.Variant({
    'None' : IDL.Null,
    'Moderators' : IDL.Null,
    'Owner' : IDL.Null,
    'Admins' : IDL.Null,
    'Members' : IDL.Null,
  });
  const CustomPermission = IDL.Record({
    'subtype' : IDL.Text,
    'role' : PermissionRole,
  });
  const MessagePermissions = IDL.Record({
    'audio' : IDL.Opt(PermissionRole),
    'video' : IDL.Opt(PermissionRole),
    'video_call' : IDL.Opt(PermissionRole),
    'custom' : IDL.Vec(CustomPermission),
    'file' : IDL.Opt(PermissionRole),
    'poll' : IDL.Opt(PermissionRole),
    'text' : IDL.Opt(PermissionRole),
    'crypto' : IDL.Opt(PermissionRole),
    'giphy' : IDL.Opt(PermissionRole),
    'default' : PermissionRole,
    'image' : IDL.Opt(PermissionRole),
    'prize' : IDL.Opt(PermissionRole),
    'p2p_swap' : IDL.Opt(PermissionRole),
  });
  const GroupPermissions = IDL.Record({
    'mention_all_members' : PermissionRole,
    'delete_messages' : PermissionRole,
    'remove_members' : PermissionRole,
    'update_group' : PermissionRole,
    'message_permissions' : MessagePermissions,
    'invite_users' : PermissionRole,
    'thread_permissions' : IDL.Opt(MessagePermissions),
    'change_roles' : PermissionRole,
    'start_video_call' : PermissionRole,
    'add_members' : PermissionRole,
    'pin_messages' : PermissionRole,
    'react_to_messages' : PermissionRole,
  });
  const CanisterId = IDL.Principal;
  const VerifiedCredentialGate = IDL.Record({
    'credential_arguments' : IDL.Vec(
      IDL.Tuple(
        IDL.Text,
        IDL.Variant({ 'Int' : IDL.Int32, 'String' : IDL.Text }),
      )
    ),
    'issuer_origin' : IDL.Text,
    'issuer_canister_id' : CanisterId,
    'credential_name' : IDL.Text,
    'credential_type' : IDL.Text,
  });
  const Milliseconds = IDL.Nat64;
  const SnsNeuronGate = IDL.Record({
    'min_stake_e8s' : IDL.Opt(IDL.Nat64),
    'min_dissolve_delay' : IDL.Opt(Milliseconds),
    'governance_canister_id' : CanisterId,
  });
  const TokenBalanceGate = IDL.Record({
    'min_balance' : IDL.Nat,
    'ledger_canister_id' : CanisterId,
  });
  const PaymentGate = IDL.Record({
    'fee' : IDL.Nat,
    'ledger_canister_id' : CanisterId,
    'amount' : IDL.Nat,
  });
  const AccessGateNonComposite = IDL.Variant({
    'UniquePerson' : IDL.Null,
    'VerifiedCredential' : VerifiedCredentialGate,
    'ReferredByMember' : IDL.Null,
    'SnsNeuron' : SnsNeuronGate,
    'Locked' : IDL.Null,
    'TokenBalance' : TokenBalanceGate,
    'DiamondMember' : IDL.Null,
    'Payment' : PaymentGate,
    'LifetimeDiamondMember' : IDL.Null,
  });
  const AccessGate = IDL.Variant({
    'UniquePerson' : IDL.Null,
    'VerifiedCredential' : VerifiedCredentialGate,
    'ReferredByMember' : IDL.Null,
    'SnsNeuron' : SnsNeuronGate,
    'Locked' : IDL.Null,
    'TokenBalance' : TokenBalanceGate,
    'Composite' : IDL.Record({
      'and' : IDL.Bool,
      'inner' : IDL.Vec(AccessGateNonComposite),
    }),
    'DiamondMember' : IDL.Null,
    'Payment' : PaymentGate,
    'LifetimeDiamondMember' : IDL.Null,
  });
  const AccessGateConfig = IDL.Record({
    'gate' : AccessGate,
    'expiry' : IDL.Opt(Milliseconds),
  });
  const AuthToken = IDL.Variant({ 'Jwt' : IDL.Text, 'ApiKey' : IDL.Text });
  const Rules = IDL.Record({ 'text' : IDL.Text, 'enabled' : IDL.Bool });
  const Document = IDL.Record({
    'id' : IDL.Nat,
    'data' : IDL.Vec(IDL.Nat8),
    'mime_type' : IDL.Text,
  });
  const BotCreateChannelArgs = IDL.Record({
    'is_public' : IDL.Bool,
    'permissions' : IDL.Opt(GroupPermissions),
    'gate_config' : IDL.Opt(AccessGateConfig),
    'auth_token' : AuthToken,
    'external_url' : IDL.Opt(IDL.Text),
    'name' : IDL.Text,
    'description' : IDL.Text,
    'events_ttl' : IDL.Opt(Milliseconds),
    'messages_visible_to_non_members' : IDL.Bool,
    'history_visible_to_new_joiners' : IDL.Bool,
    'rules' : Rules,
    'avatar' : IDL.Opt(Document),
  });
  const ChannelId = IDL.Nat32;
  const BotCreateChannelResponse = IDL.Variant({
    'NotAuthorized' : IDL.Null,
    'Success' : IDL.Record({ 'channel_id' : ChannelId }),
    'InvalidRequest' : IDL.Text,
    'C2CError' : IDL.Tuple(IDL.Int32, IDL.Text),
    'Frozen' : IDL.Null,
  });
  const GiphyImageVariant = IDL.Record({
    'url' : IDL.Text,
    'height' : IDL.Nat32,
    'mime_type' : IDL.Text,
    'width' : IDL.Nat32,
  });
  const GiphyContent = IDL.Record({
    'title' : IDL.Text,
    'desktop' : GiphyImageVariant,
    'caption' : IDL.Opt(IDL.Text),
    'mobile' : GiphyImageVariant,
  });
  const BlobReference = IDL.Record({
    'blob_id' : IDL.Nat,
    'canister_id' : CanisterId,
  });
  const FileContent = IDL.Record({
    'name' : IDL.Text,
    'mime_type' : IDL.Text,
    'file_size' : IDL.Nat32,
    'blob_reference' : IDL.Opt(BlobReference),
    'caption' : IDL.Opt(IDL.Text),
  });
  const UserId = CanisterId;
  const TotalPollVotes = IDL.Variant({
    'Anonymous' : IDL.Vec(IDL.Tuple(IDL.Nat32, IDL.Nat32)),
    'Visible' : IDL.Vec(IDL.Tuple(IDL.Nat32, IDL.Vec(UserId))),
    'Hidden' : IDL.Nat32,
  });
  const PollVotes = IDL.Record({
    'total' : TotalPollVotes,
    'user' : IDL.Vec(IDL.Nat32),
  });
  const TimestampMillis = IDL.Nat64;
  const PollConfig = IDL.Record({
    'allow_multiple_votes_per_user' : IDL.Bool,
    'text' : IDL.Opt(IDL.Text),
    'show_votes_before_end_date' : IDL.Bool,
    'end_date' : IDL.Opt(TimestampMillis),
    'anonymous' : IDL.Bool,
    'allow_user_to_change_vote' : IDL.Bool,
    'options' : IDL.Vec(IDL.Text),
  });
  const PollContent = IDL.Record({
    'votes' : PollVotes,
    'ended' : IDL.Bool,
    'config' : PollConfig,
  });
  const TextContent = IDL.Record({ 'text' : IDL.Text });
  const ImageContent = IDL.Record({
    'height' : IDL.Nat32,
    'mime_type' : IDL.Text,
    'blob_reference' : IDL.Opt(BlobReference),
    'thumbnail_data' : IDL.Text,
    'caption' : IDL.Opt(IDL.Text),
    'width' : IDL.Nat32,
  });
  const AudioContent = IDL.Record({
    'mime_type' : IDL.Text,
    'blob_reference' : IDL.Opt(BlobReference),
    'caption' : IDL.Opt(IDL.Text),
  });
  const VideoContent = IDL.Record({
    'height' : IDL.Nat32,
    'image_blob_reference' : IDL.Opt(BlobReference),
    'video_blob_reference' : IDL.Opt(BlobReference),
    'mime_type' : IDL.Text,
    'thumbnail_data' : IDL.Text,
    'caption' : IDL.Opt(IDL.Text),
    'width' : IDL.Nat32,
  });
  const MessageContent = IDL.Variant({
    'Giphy' : GiphyContent,
    'File' : FileContent,
    'Poll' : PollContent,
    'Text' : TextContent,
    'Image' : ImageContent,
    'Audio' : AudioContent,
    'Video' : VideoContent,
  });
  const MessageId = IDL.Nat64;
  const BotSendMessageArgs = IDL.Record({
    'channel_id' : IDL.Opt(ChannelId),
    'content' : MessageContent,
    'auth_token' : AuthToken,
    'block_level_markdown' : IDL.Bool,
    'finalised' : IDL.Bool,
    'message_id' : IDL.Opt(MessageId),
  });
  const EventIndex = IDL.Nat32;
  const MessageIndex = IDL.Nat32;
  const BotSendMessageResponse = IDL.Variant({
    'ThreadNotFound' : IDL.Null,
    'NotAuthorized' : IDL.Null,
    'Success' : IDL.Record({
      'timestamp' : TimestampMillis,
      'message_id' : MessageId,
      'event_index' : EventIndex,
      'expires_at' : IDL.Opt(TimestampMillis),
      'message_index' : MessageIndex,
    }),
    'InvalidRequest' : IDL.Text,
    'MessageAlreadyFinalised' : IDL.Null,
    'C2CError' : IDL.Tuple(IDL.Int32, IDL.Text),
    'Frozen' : IDL.Null,
  });
  return IDL.Service({
    'bot_create_channel' : IDL.Func(
        [BotCreateChannelArgs],
        [BotCreateChannelResponse],
        [],
      ),
    'bot_send_message' : IDL.Func(
        [BotSendMessageArgs],
        [BotSendMessageResponse],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return []; };
