# Uber bot

This is an experimental bot. It does not talk to uber! The idea is to create an AI wrapper around the bot client SDK in general.

The aim is to create a general purpose OC helper bot that can understand instructions given in natural language and perform any function that the bot SDK can perform.

Step one is to see if this is feasible to do as a standalone bot. Step two might be to provide this as a library which essentially provides a curated list of agent tools that can be fed to an AI to teach it how to interact with OC. This can then be combined with additional tools to supplement more custom bot behaviour. We shall see.

### Notes

This is broadly feasible but there are issues.

- param parsing: take a common use case like "make @some_user an admin". This will not currently work because we cannot provide a tool that gives us the userid from the username (fixable)
- split between commands and queries: the AI does not know or care about this distinction so it is up to us to overlay approval on top. This one is more difficult. I think what we need is for the AI to propose (a series of actions) something like:

```
type ProposedAction = {
    id: string;
    action: "deleteMessage" | "changeRole" | "banUser" | etc;
    payload: unknown;
    reason: string;
    proposedBy: "ai";
    status: "pending" | "approved" | "rejected" | "expired";
    approvedBy?: string;
    createdAt: Date;
};
```

We have the AI respond to the chat with a human readable version of this proposed action. Somehow the initiator then needs to respond to this (maybe by reacting to it or replying to it). When the bot receives that reaction (via /notify) it can take the action proposed in the plan. The problem with this is that the original message would need to somehow contain the serialised plan in some sort of metadata payload.

How does this change the tool use? It means we have schemas for the command style operations but we do not expose them as callable tools. Only the readonly operations can be directly called by the AI. Then it will respond either with the requested information or with one or more proposed actions. So in addition to the readonly tools we have a `propose_actions` tool.

One annoyance with this is that it forces us to make the proposed action message non-ephemeral which means everyone sees this intermediary message and we have to artificially ensure that only the original initiator can respond to it. That sucks. But doing it with an ephemeral message would not work because we can't react or reply to them.

The alternative is that this is _not_ a normal bot, it's a special bot that is automatically available in every chat and has a special UI. That's a lot more work. Let's cross that bridge later.

#### Scope

It also feels limiting that I am talking to this bot in the scope of a specific chat. It seems like it would also be nice to have something like this but globally. i.e. the open chat bot. So then rather than having the permissions that it has been granted in a specific scope, it just inherits the permissions that _I_ the caller have in _any_ scope. So it can do anything I can do but nothing that I can't do.

At that point it is not really a bot at all though.
