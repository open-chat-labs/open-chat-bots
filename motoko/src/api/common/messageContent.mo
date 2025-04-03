import Base64 "mo:base64";
import J "mo:json";
import Principal "mo:base/Principal";
import Nat64 "mo:base/Nat64";
import Serialize "serialization";
import B "base";

module {
    public type MessageContent = {
        #Text : TextContent;
        #Image : ImageContent;
        #Video : VideoContent;
        #Audio : AudioContent;
        #File : FileContent;
        #Poll : PollContent;
        #Deleted : DeletedBy;
        #Giphy : GiphyContent;
        #Custom : CustomContent;
        #Unsupported : UnsupportedContent;
    };

    public type MessageContentInitial = {
        #Text : TextContent;
        #Image : ImageContent;
        #Video : VideoContent;
        #Audio : AudioContent;
        #File : FileContent;
        #Poll : PollContent;
        #Giphy : GiphyContent;
        #Custom : CustomContent;
    };

    public type TextContent = {
        text : Text;
    };

    public type ImageContent = {
        width : Nat;
        height : Nat;
        thumbnail_data : ThumbnailData;
        caption : ?Text;
        mime_type : Text;
        blob_reference : ?BlobReference;
    };

    public type ThumbnailData = (Text);

    public type BlobReference = {
        canister : B.CanisterId;
        blob_id : Nat;
    };

    public type VideoContent = {
        width : Nat;
        height : Nat;
        thumbnail_data : ThumbnailData;
        caption : ?Text;
        mime_type : Text;
        image_blob_reference : ?BlobReference;
        video_blob_reference : ?BlobReference;
    };

    public type AudioContent = {
        caption : ?Text;
        mime_type : Text;
        blob_reference : ?BlobReference;
    };

    public type FileContent = {
        name : Text;
        caption : ?Text;
        mime_type : Text;
        file_size : Nat;
        blob_reference : ?BlobReference;
    };

    public type PollContent = {
        config : PollConfig;
    };

    public type PollConfig = {
        text : ?Text;
        options : [Text];
        end_date : ?B.TimestampMillis;
        anonymous : Bool;
        show_votes_before_end_date : Bool;
        allow_multiple_votes_per_user : Bool;
        allow_user_to_change_vote : Bool;
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
        mime_type : Text;
    };

    public type CustomContent = {
        kind : Text;
        data : [Nat8];
    };

    public type DeletedBy = {
        deleted_by : B.UserId;
        timestamp : B.TimestampMillis;
    };

    public type UnsupportedContent = {
        kind : Text;
    };

    public module Ser {
        public func serialize(content : MessageContentInitial) : J.Json {
            let (kind, value) : (Text, J.Json) = switch (content) {
                case (#Text(text)) ("Text", serializeTextContent(text));
                case (#Image(image)) ("Image", serializeImageContent(image));
                case (#Video(video)) ("Video", serializeVideoContent(video));
                case (#Audio(audio)) ("Audio", serializeAudioContent(audio));
                case (#File(file)) ("File", serializeFileContent(file));
                case (#Poll(poll)) ("Poll", serializePollContent(poll));
                case (#Giphy(giphy)) ("Giphy", serializeGiphyContent(giphy));
                case (#Custom(custom)) ("Custom", serializeCustomContent(custom));
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
                ("thumbnail_data", #string(image.thumbnail_data)),
                (
                    "caption",
                    Serialize.nullable<Text>(image.caption, Serialize.text),
                ),
                ("mime_type", #string(image.mime_type)),
                (
                    "blob_reference",
                    Serialize.nullable<BlobReference>(image.blob_reference, serializeBlobReference),
                ),
            ]);
        };

        private func serializeVideoContent(video : VideoContent) : J.Json {
            #object_([
                ("width", #number(#int(video.width))),
                ("height", #number(#int(video.height))),
                ("thumbnail_data", #string(video.thumbnail_data)),
                (
                    "caption",
                    Serialize.nullable<Text>(video.caption, Serialize.text),
                ),
                ("mime_type", #string(video.mime_type)),
                (
                    "image_blob_reference",
                    Serialize.nullable<BlobReference>(video.image_blob_reference, serializeBlobReference),
                ),
                (
                    "video_blob_reference",
                    Serialize.nullable<BlobReference>(video.video_blob_reference, serializeBlobReference),
                ),
            ]);
        };

        private func serializeAudioContent(audio : AudioContent) : J.Json {
            #object_([
                (
                    "caption",
                    Serialize.nullable<Text>(audio.caption, Serialize.text),
                ),
                ("mime_type", #string(audio.mime_type)),
                (
                    "blob_reference",
                    Serialize.nullable<BlobReference>(audio.blob_reference, serializeBlobReference),
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
                ("mime_type", #string(file.mime_type)),
                ("file_size", #number(#int(file.file_size))),
                (
                    "blob_reference",
                    Serialize.nullable<BlobReference>(file.blob_reference, serializeBlobReference),
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
                    Serialize.nullable<Nat64>(pollConfig.end_date, Serialize.nat64),
                ),
                ("anonymous", #bool(pollConfig.anonymous)),
                ("show_votes_before_end_date", #bool(pollConfig.show_votes_before_end_date)),
                ("allow_multiple_votes_per_user", #bool(pollConfig.allow_multiple_votes_per_user)),
                ("allow_user_to_change_vote", #bool(pollConfig.allow_user_to_change_vote)),
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
            let base64Engine = Base64.Base64(#v(Base64.V2), ?false);
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
                ("mime_type", #string(giphyImageVariant.mime_type)),
            ]);
        };

        private func serializeBlobReference(blobReference : BlobReference) : J.Json {
            #object_([
                ("canister_id", #string(Principal.toText(blobReference.canister))),
                (
                    "blob_id",
                    #number(#int(blobReference.blob_id)),
                ),
            ]);
        };
    }
}