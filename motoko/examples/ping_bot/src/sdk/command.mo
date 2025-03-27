import T "lib";
import M "message";

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

    public type CommandResponse = {
        #success : SuccessResult;
        #badRequest : BadRequestResult;
        #internalError : InternalErrorResult;
    };

    public type SuccessResult = {
        message : ?M.Message;
    };

    public type BadRequestResult = {
        #accessTokenNotFound;
        #accessTokenInvalid;
        #accessTokenExpired;
        #commandNotFound;
        #argsInvalid;
    };

    public type InternalErrorResult = {
        #invalid : Text;
        #canisterError : CanisterError;
        #c2cError : C2CError;
    };

    public type CanisterError = {
        #notAuthorized;
        #frozen;
        #other : Text;
    };

    public type C2CError = (Int, Text);
}