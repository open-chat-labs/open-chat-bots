import Int32 "mo:base/Int32";
import M "../common/message_content";
import T "../common/base";

module {
    public type Command = {
        name : Text;
        args : [CommandArg];
        initiator : T.UserId;
        meta : ?CommandMeta;
    };

    public type CommandMeta = {
        timezone : Text; // IANA timezone e.g. "Europe/London"
        language : Text; // The language selected in OpenChat e.g. "en"
    };

    public type CommandArg = {
        name : Text;
        value : CommandArgValue;
    };

    public type CommandArgValue = {
        #string : Text;
        #integer : Int64;
        #decimal : Float;
        #boolean : Bool;
        #user : T.UserId;
        #datetime : T.TimestampMillis;
    };

    public type Response = {
        #Success : SuccessResult;
        #BadRequest : BadRequestResult;
        #InternalError : InternalErrorResult;
    };

    public type BadRequestResult = {
        #AccessTokenNotFound;
        #AccessTokenInvalid : Text;
        #AccessTokenExpired;
        #CommandNotFound;
        #ArgsInvalid;
    };

    public type InternalErrorResult = {
        #Invalid : Text;
        #CanisterError : CanisterError;
        #C2CError : C2CError;
    };

    public type CanisterError = {
        #NotAuthorized;
        #Frozen;
        #Other : Text;
    };

    public type C2CError = (Int32, Text);

    public type SuccessResult = {
        message : ?Message;
    };

    public type Message = {
        id : T.MessageId;
        content : M.MessageContentInitial;
        finalised : Bool;
        blockLevelMarkdown : Bool;
        ephemeral : Bool;
    };
}