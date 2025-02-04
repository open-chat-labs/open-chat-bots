export const idlFactory = ({ IDL }) => {
  const ChannelId = IDL.Nat32;
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
  const CanisterId = IDL.Principal;
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
  const AuthToken = IDL.Variant({ 'Jwt' : IDL.Text, 'ApiKey' : IDL.Text });
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
  const SuccessResult = IDL.Record({
    'timestamp' : TimestampMillis,
    'message_id' : MessageId,
    'event_index' : EventIndex,
    'expires_at' : IDL.Opt(TimestampMillis),
    'message_index' : MessageIndex,
  });
  const BotSendMessageResponse = IDL.Variant({
    'ThreadNotFound' : IDL.Null,
    'NotAuthorized' : IDL.Null,
    'Success' : SuccessResult,
    'InvalidRequest' : IDL.Text,
    'MessageAlreadyFinalised' : IDL.Null,
    'C2CError' : IDL.Tuple(IDL.Int32, IDL.Text),
    'Frozen' : IDL.Null,
  });
  return IDL.Service({
    'bot_send_message' : IDL.Func(
        [BotSendMessageArgs],
        [BotSendMessageResponse],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return []; };
