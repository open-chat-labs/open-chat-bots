import Array "mo:base/Array";
import Principal "mo:base/Principal";
import Text "mo:base/Text";
import B "mo:openchat-bot-sdk/api/common/base";

module {
    public func userIdsToText(userIds : ?[B.UserId]) : Text {
        switch (userIds) {
            case (?ids) Array.map(ids, func(id : B.UserId) : Text = "@UserId(" # Principal.toText(id) # ")") 
                |> Array.vals(_) 
                |> Text.join(", ", _);
            case null "No matches found";
        };
    };

}