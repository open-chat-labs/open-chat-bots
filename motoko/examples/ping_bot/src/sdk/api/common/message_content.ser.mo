import B "mo:base64";
import J "mo:json";
import Principal "mo:base/Principal";
import Nat64 "mo:base/Nat64";
import Serialize "serialization";
import MessageContent "message_content";

module {
    public func messageContent(content : MessageContent.MessageContentInitial) : J.Json {
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

    private func serializeTextContent(text : MessageContent.TextContent) : J.Json {
        #object_([("text", #string(text.text))]);
    };

    private func serializeImageContent(image : MessageContent.ImageContent) : J.Json {
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
                Serialize.nullable<MessageContent.BlobReference>(image.blob_reference, serializeBlobReference),
            ),
        ]);
    };

    private func serializeVideoContent(video : MessageContent.VideoContent) : J.Json {
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
                Serialize.nullable<MessageContent.BlobReference>(video.image_blob_reference, serializeBlobReference),
            ),
            (
                "video_blob_reference",
                Serialize.nullable<MessageContent.BlobReference>(video.video_blob_reference, serializeBlobReference),
            ),
        ]);
    };

    private func serializeAudioContent(audio : MessageContent.AudioContent) : J.Json {
        #object_([
            (
                "caption",
                Serialize.nullable<Text>(audio.caption, Serialize.text),
            ),
            ("mime_type", #string(audio.mime_type)),
            (
                "blob_reference",
                Serialize.nullable<MessageContent.BlobReference>(audio.blob_reference, serializeBlobReference),
            ),
        ]);
    };

    private func serializeFileContent(file : MessageContent.FileContent) : J.Json {
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
                Serialize.nullable<MessageContent.BlobReference>(file.blob_reference, serializeBlobReference),
            ),
        ]);
    };

    private func serializePollContent(poll : MessageContent.PollContent) : J.Json {
        #object_([
            ("config", serializePollConfig(poll.config)),
        ]);
    };

    private func serializePollConfig(pollConfig : MessageContent.PollConfig) : J.Json {
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

    private func serializeGiphyContent(giphy : MessageContent.GiphyContent) : J.Json {
        #object_([
            ("caption", Serialize.nullable<Text>(giphy.caption, Serialize.text)),
            ("title", #string(giphy.title)),
            ("desktop", serializeGiphyImageVariant(giphy.desktop)),
            ("mobile", serializeGiphyImageVariant(giphy.mobile)),
        ]);
    };

    private func serializeCustomContent(custom : MessageContent.CustomContent) : J.Json {
        let base64Engine = B.Base64(#v(B.V2), ?false);
        let dataText = base64Engine.encode(#bytes(custom.data));
        #object_([
            ("kind", #string(custom.kind)),
            ("data", #string(dataText)),
        ]);
    };

    private func serializeGiphyImageVariant(giphyImageVariant : MessageContent.GiphyImageVariant) : J.Json {
        #object_([
            ("width", #number(#int(giphyImageVariant.width))),
            ("height", #number(#int(giphyImageVariant.height))),
            ("url", #string(giphyImageVariant.url)),
            ("mime_type", #string(giphyImageVariant.mime_type)),
        ]);
    };

    private func serializeBlobReference(blobReference : MessageContent.BlobReference) : J.Json {
        #object_([
            ("canister_id", #string(Principal.toText(blobReference.canister))),
            (
                "blob_id",
                #number(#int(blobReference.blob_id)),
            ),
        ]);
    };
}