module {
    public type MemberType = {
        #Owner;
        #Admin;
        #Moderator;
        #Member;
        #Blocked;
        #Invited;
        #Lapsed;
        #Bot;
        #Webhook;
    };

    public func toText(memberType : MemberType) : Text {
        switch memberType {
            case (#Owner) "Owner";
            case (#Admin) "Admin";
            case (#Moderator) "Moderator";
            case (#Member) "Member";
            case (#Blocked) "Blocked";
            case (#Invited) "Invited";
            case (#Lapsed) "Lapsed";
            case (#Bot) "Bot";
            case (#Webhook) "Webhook";
        }
    };

    public func fromText(text : Text) : ?MemberType {
        switch text {
            case "Owner" ?#Owner;
            case "Admin" ?#Admin;
            case "Moderator" ?#Moderator;
            case "Member" ?#Member;
            case "Blocked" ?#Blocked;
            case "Invited" ?#Invited;
            case "Lapsed" ?#Lapsed;
            case "Bot" ?#Bot;
            case "Webhook" ?#Webhook;
            case _ null;
        }
    };  

    public func toArray() : [MemberType] {
        [
            #Owner,
            #Admin,
            #Moderator,
            #Member,
            #Blocked,
            #Invited,
            #Lapsed,
            #Bot,
            #Webhook
        ]
    };  
}