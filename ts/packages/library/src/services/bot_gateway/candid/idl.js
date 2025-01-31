export const idlFactory = ({ IDL }) => {
  const AccessTokenArgs = IDL.Variant({ 'BotActionByApiKey' : IDL.Text });
  const AccessTokenResponse = IDL.Variant({
    'NotAuthorized' : IDL.Null,
    'Success' : IDL.Text,
    'InternalError' : IDL.Text,
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
  const BotAction = IDL.Variant({
    'SendMessage' : IDL.Record({
      'content' : MessageContent,
      'finalised' : IDL.Bool,
    }),
  });
  const ExecuteBotCommandArgs = IDL.Record({
    'jwt' : IDL.Text,
    'action' : BotAction,
  });
  const ExecuteBotCommandResponse = IDL.Variant({
    'Ok' : IDL.Null,
    'Err' : IDL.Variant({
      'Invalid' : IDL.Text,
      'CanisterError' : IDL.Variant({
        'NotAuthorized' : IDL.Null,
        'Other' : IDL.Text,
        'Frozen' : IDL.Null,
      }),
      'C2CError' : IDL.Tuple(IDL.Nat32, IDL.Text),
    }),
  });
  return IDL.Service({
    'access_token_v2' : IDL.Func(
        [AccessTokenArgs],
        [AccessTokenResponse],
        ['query'],
      ),
    'execute_bot_action' : IDL.Func(
        [ExecuteBotCommandArgs],
        [ExecuteBotCommandResponse],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return []; };
