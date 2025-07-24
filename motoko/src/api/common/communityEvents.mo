import B "base";
import C "chatEvents";
import P "communityPermissions";

module {
    type UserId = B.UserId;
    type ChannelId = B.ChannelId;
    type ChatId = B.ChatId;
    
    public type CommunityEvent = {
        #Created : CommunityCreated;
        #NameChanged : C.NameChanged;
        #DescriptionChanged : C.DescriptionChanged;
        #RulesChanged : C.RulesChanged;
        #AvatarChanged : C.AvatarChanged;
        #BannerChanged : BannerChanged;
        #UsersInvited : C.UsersInvited;
        #MemberJoined : CommunityMemberJoined;
        #MemberLeft : C.MemberLeft;
        #MembersRemoved : CommunityMembersRemoved;
        #RoleChanged : CommunityRoleChanged;
        #UsersBlocked : CommunityUsersBlocked;
        #UsersUnblocked : CommunityUsersUnblocked;
        #PermissionsChanged : CommunityPermissionsChanged;
        #VisibilityChanged : CommunityVisibilityChanged;
        #InviteCodeChanged : C.InviteCodeChanged;
        #Frozen : CommunityFrozen;
        #Unfrozen : CommunityUnfrozen;
        #GateUpdated : GateUpdated;
        #ChannelCreated : ChannelCreated;
        #ChannelDeleted : ChannelDeleted;
        #PrimaryLanguageChanged : PrimaryLanguageChanged;
        #GroupImported : GroupImported;
        #BotAdded : BotAdded;
        #BotRemoved : BotRemoved;
        #BotUpdated : BotUpdated;
        #FailedToDeserialize;
    };

    public type CommunityCreated = {
        name : Text;
        description : Text;
        created_by : UserId;
    };

    public type BannerChanged = {
        new_banner : ?Nat;
        previous_banner : ?Nat;
        changed_by : UserId;
    };

    public type CommunityMemberJoined = {
        user_id : UserId;
        channel_id : ?ChannelId;
        invited_by : ?UserId;
    };

    public type CommunityMembersRemoved = {
        user_ids : [UserId];
        removed_by : UserId;
        referred_by : [(UserId, UserId)];
    };

    public type CommunityUsersBlocked = {
        user_ids : [UserId];
        blocked_by : UserId;
        referred_by : [(UserId, UserId)];
    };

    public type CommunityUsersUnblocked = {
        user_ids : [UserId];
        unblocked_by : UserId;
    };

    public type CommunityPermissionsChanged = {
        old_permissions : P.CommunityPermissions;
        new_permissions : P.CommunityPermissions;
        changed_by : UserId;
    };

    public type CommunityVisibilityChanged = {
        now_public : Bool;
        changed_by : UserId;
    };

    public type CommunityRoleChanged = {
        user_ids : [UserId];
        changed_by : UserId;
        old_role : P.CommunityRole;
        new_role : P.CommunityRole;
    };

    public type GroupImported = {
        group_id : ChatId;
        channel_id : ChannelId;
    };

    public type ChannelCreated = {
        channel_id : ChannelId;
        is_public : Bool;
        name : Text;
        created_by : UserId;
    };

    public type CommunityFrozen = {
        frozen_by : UserId;
        reason : ?Text;
    };
    
    public type CommunityUnfrozen = {
        unfrozen_by : UserId;
    };
    
    public type GateUpdated = {
        updated_by : UserId;
    };
    
    public type ChannelDeleted = {
        channel_id : ChannelId;
        name : Text;
        deleted_by : UserId;
    };
    
    public type PrimaryLanguageChanged = {
        previous_language : Text;
        new_language : Text;
        changed_by : UserId;
    };
    
    public type BotAdded = {
        bot_id : UserId;
        added_by : UserId;
    };
    
    public type BotRemoved = {
        bot_id : UserId;
        removed_by : UserId;
    };
    
    public type BotUpdated = {
        bot_id : UserId;
        updated_by : UserId;
    };
};