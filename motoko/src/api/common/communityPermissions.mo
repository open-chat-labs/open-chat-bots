module {
    public type CommunityRole = {
        #Owner;
        #Admin;
        #Member;
    };
    
    public type CommunityPermissionRole = {
        #Owners;
        #Admins;
        #Members;
    };

    public type CommunityPermissions = {
        change_roles : CommunityPermissionRole;
        update_details : CommunityPermissionRole;
        invite_users : CommunityPermissionRole;
        remove_members : CommunityPermissionRole;
        create_public_channel : CommunityPermissionRole;
        create_private_channel : CommunityPermissionRole;
        manage_user_groups : CommunityPermissionRole;
    };
};