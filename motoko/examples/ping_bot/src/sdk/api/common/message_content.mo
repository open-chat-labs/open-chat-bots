import B "mo:base64";
import J "mo:json";
import Principal "mo:base/Principal";
import Nat64 "mo:base/Nat64";
import Serialize "serialization";
import T "base";

module {
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
        canister : T.CanisterId;
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
        end_date : ?T.TimestampMillis;
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
}