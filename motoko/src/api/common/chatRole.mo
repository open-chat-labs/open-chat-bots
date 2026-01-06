module {
    public type ChatRole = {
        #Owner;
        #Admin;
        #Moderator;
        #Participant;
    };

    public func fromText(text : Text) : ?ChatRole {
        switch text {
            case "Owner" ?#Owner;
            case "Admin" ?#Admin;
            case "Administrator" ?#Admin;
            case "Moderator" ?#Moderator;
            case "Participant" ?#Participant;
            case "Member" ?#Participant;
            case _ null;
        }
    };  
};
