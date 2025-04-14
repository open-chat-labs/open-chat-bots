module {
    public type ChatPermissions = {
        change_roles : ChatPermissionRole;
        update_group : ChatPermissionRole;
        add_members : ChatPermissionRole;
        invite_users : ChatPermissionRole;
        remove_members : ChatPermissionRole;
        delete_messages : ChatPermissionRole;
        pin_messages : ChatPermissionRole;
        react_to_messages : ChatPermissionRole;
        mention_all_members : ChatPermissionRole;
        start_video_call : ChatPermissionRole;
        message_permissions : MessagePermissions;
        thread_permissions : ?MessagePermissions;
    };

    public type MessagePermissions = {
        default : ChatPermissionRole;
        text : ?ChatPermissionRole;
        image : ?ChatPermissionRole;
        video : ?ChatPermissionRole;
        audio : ?ChatPermissionRole;
        file : ?ChatPermissionRole;
        poll : ?ChatPermissionRole;
        crypto : ?ChatPermissionRole;
        giphy : ?ChatPermissionRole;
        prize : ?ChatPermissionRole;
        p2p_swap : ?ChatPermissionRole;
        video_call : ?ChatPermissionRole;
        custom : [CustomPermission];
    };

    public type CustomPermission = {
        subtype : Text;
        role : ChatPermissionRole;
    };

    public type ChatPermissionRole = {
        #None;
        #Owner;
        #Admins;
        #Moderators;
        #Members;
    };
};
