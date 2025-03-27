import B "mo:base64";
import J "mo:json";
import T "lib";
import Principal "mo:base/Principal";
import Nat64 "mo:base/Nat64";
import Serialize "serialization";

module {
    public type Message = {
        id : T.MessageId;
        content : MessageContentInitial;
        finalised : Bool;
        blockLevelMarkdown : Bool;
        ephemeral : Bool;
    };

    public type MessageContentInitial = {
        #text : TextContent;
        #image : ImageContent;
        #video : VideoContent;
        #audio : AudioContent;
        #file : FileContent;
        #poll : PollContent;
        #giphy : GiphyContent;
        #custom : CustomContent;
    };

    public type TextContent = {
        text : Text;
    };

    public type ImageContent = {
        width : Nat;
        height : Nat;
        thumbnailData : ThumbnailData;
        caption : ?Text;
        mimeType : Text;
        blobReference : ?BlobReference;
    };

    public type ThumbnailData = (Text);

    public type BlobReference = {
        canister : T.CanisterId;
        blobId : Nat;
    };

    public type VideoContent = {
        width : Nat;
        height : Nat;
        thumbnailData : ThumbnailData;
        caption : ?Text;
        mimeType : Text;
        imageBlobReference : ?BlobReference;
        videoBlobReference : ?BlobReference;
    };

    public type AudioContent = {
        caption : ?Text;
        mimeType : Text;
        blobReference : ?BlobReference;
    };

    public type FileContent = {
        name : Text;
        caption : ?Text;
        mimeType : Text;
        fileSize : Nat;
        blobReference : ?BlobReference;
    };

    public type PollContent = {
        config : PollConfig;
    };

    public type PollConfig = {
        text : ?Text;
        options : [Text];
        endDate : ?T.TimestampMillis;
        anonymous : Bool;
        showVotesBeforeEndDate : Bool;
        allowMultipleVotesPerUser : Bool;
        allowUserToChangeVote : Bool;
    };

    public type GiphyContent = {
        caption : ?Text;
        title : Text;
        desktop : GiphyImageVariant;
        mobile : GiphyImageVariant;
    };

    public type GiphyImageVariant = {
        width : Nat;
        height : Nat;
        url : Text;
        mimeType : Text;
    };

    public type CustomContent = {
        kind : Text;
        data : [Nat8];
    };

    public func serialize(message : Message) : J.Json {
        #object_([
            ("id", #string(Nat64.toText(message.id))),
            ("content", serializeMessageContent(message.content)),
            ("finalised", #bool(message.finalised)),
        ]);
    };

    private func serializeMessageContent(content : MessageContentInitial) : J.Json {
        let (kind, value) : (Text, J.Json) = switch (content) {
            case (#text(text)) ("Text", serializeTextContent(text));
            case (#image(image)) ("Image", serializeImageContent(image));
            case (#video(video)) ("Video", serializeVideoContent(video));
            case (#audio(audio)) ("Audio", serializeAudioContent(audio));
            case (#file(file)) ("File", serializeFileContent(file));
            case (#poll(poll)) ("Poll", serializePollContent(poll));
            case (#giphy(giphy)) ("Giphy", serializeGiphyContent(giphy));
            case (#custom(custom)) ("Custom", serializeCustomContent(custom));
        };
        Serialize.variantWithValue(kind, value);
    };

    private func serializeTextContent(text : TextContent) : J.Json {
        #object_([("text", #string(text.text))]);
    };

    private func serializeImageContent(image : ImageContent) : J.Json {
        #object_([
            ("width", #number(#int(image.width))),
            ("height", #number(#int(image.height))),
            ("thumbnail_data", #string(image.thumbnailData)),
            (
                "caption",
                Serialize.nullable<Text>(image.caption, Serialize.text),
            ),
            ("mime_type", #string(image.mimeType)),
            (
                "blob_reference",
                Serialize.nullable<BlobReference>(image.blobReference, serializeBlobReference),
            ),
        ]);
    };

    private func serializeVideoContent(video : VideoContent) : J.Json {
        #object_([
            ("width", #number(#int(video.width))),
            ("height", #number(#int(video.height))),
            ("thumbnail_data", #string(video.thumbnailData)),
            (
                "caption",
                Serialize.nullable<Text>(video.caption, Serialize.text),
            ),
            ("mime_type", #string(video.mimeType)),
            (
                "image_blob_reference",
                Serialize.nullable<BlobReference>(video.imageBlobReference, serializeBlobReference),
            ),
            (
                "video_blob_reference",
                Serialize.nullable<BlobReference>(video.videoBlobReference, serializeBlobReference),
            ),
        ]);
    };

    private func serializeAudioContent(audio : AudioContent) : J.Json {
        #object_([
            (
                "caption",
                Serialize.nullable<Text>(audio.caption, Serialize.text),
            ),
            ("mime_type", #string(audio.mimeType)),
            (
                "blob_reference",
                Serialize.nullable<BlobReference>(audio.blobReference, serializeBlobReference),
            ),
        ]);
    };

    private func serializeFileContent(file : FileContent) : J.Json {
        #object_([
            ("name", #string(file.name)),
            (
                "caption",
                Serialize.nullable<Text>(file.caption, Serialize.text),
            ),
            ("mime_type", #string(file.mimeType)),
            ("file_size", #number(#int(file.fileSize))),
            (
                "blob_reference",
                Serialize.nullable<BlobReference>(file.blobReference, serializeBlobReference),
            ),
        ]);
    };

    private func serializePollContent(poll : PollContent) : J.Json {
        #object_([
            ("config", serializePollConfig(poll.config)),
        ]);
    };

    private func serializePollConfig(pollConfig : PollConfig) : J.Json {
        #object_([
            ("text", Serialize.nullable<Text>(pollConfig.text, Serialize.text)),
            ("options", Serialize.arrayOfValues(pollConfig.options, Serialize.text)),
            (
                "end_date",
                Serialize.nullable<Nat64>(pollConfig.endDate, Serialize.nat64),
            ),
            ("anonymous", #bool(pollConfig.anonymous)),
            ("show_votes_before_end_date", #bool(pollConfig.showVotesBeforeEndDate)),
            ("allow_multiple_votes_per_user", #bool(pollConfig.allowMultipleVotesPerUser)),
            ("allow_user_to_change_vote", #bool(pollConfig.allowUserToChangeVote)),
        ]);
    };

    private func serializeGiphyContent(giphy : GiphyContent) : J.Json {
        #object_([
            ("caption", Serialize.nullable<Text>(giphy.caption, Serialize.text)),
            ("title", #string(giphy.title)),
            ("desktop", serializeGiphyImageVariant(giphy.desktop)),
            ("mobile", serializeGiphyImageVariant(giphy.mobile)),
        ]);
    };

    private func serializeCustomContent(custom : CustomContent) : J.Json {
        let base64Engine = B.Base64(#v(B.V2), ?false);
        let dataText = base64Engine.encode(#bytes(custom.data));
        #object_([
            ("kind", #string(custom.kind)),
            ("data", #string(dataText)),
        ]);
    };

    private func serializeGiphyImageVariant(giphyImageVariant : GiphyImageVariant) : J.Json {
        #object_([
            ("width", #number(#int(giphyImageVariant.width))),
            ("height", #number(#int(giphyImageVariant.height))),
            ("url", #string(giphyImageVariant.url)),
            ("mime_type", #string(giphyImageVariant.mimeType)),
        ]);
    };

    private func serializeBlobReference(blobReference : BlobReference) : J.Json {
        #object_([
            ("canister_id", #string(Principal.toText(blobReference.canister))),
            (
                "blob_id",
                #number(#int(blobReference.blobId)),
            ),
        ]);
    };
}