import { Static, Type } from "@sinclair/typebox";
import { AssertError, Value } from "@sinclair/typebox/value";

export const DeleteMessageStep = Type.Object(
    {
        action: Type.Literal("delete_message"),
        messageId: Type.String(),
    },
    { additionalProperties: false },
);

export const ReactToMessage = Type.Object(
    {
        action: Type.Literal("react_to_message"),
        messageId: Type.String(),
        reaction: Type.String(),
    },
    { additionalProperties: false },
);

export const ReactToMessages = Type.Object(
    {
        action: Type.Literal("react_to_messages"),
        messageIds: Type.Array(Type.String(), { minItems: 1 }),
        reaction: Type.String(),
    },
    { additionalProperties: false },
);

export const ChangeRoleStep = Type.Object(
    {
        action: Type.Literal("change_role"),
        userId: Type.String(),
        role: Type.Union([
            Type.Literal("none"),
            Type.Literal("moderator"),
            Type.Literal("owner"),
            Type.Literal("admin"),
            Type.Literal("member"),
        ]),
    },
    { additionalProperties: false },
);

export const CreateChannelStep = Type.Object(
    {
        action: Type.Literal("create_channel"),
        name: Type.String(),
        description: Type.String(),
        isPublic: Type.Boolean(),
    },
    { additionalProperties: false },
);

export const DeleteChannelStep = Type.Object(
    {
        action: Type.Literal("delete_channel"),
        channelId: Type.String(),
    },
    { additionalProperties: false },
);

export const PlanStep = Type.Union([
    DeleteMessageStep,
    ChangeRoleStep,
    CreateChannelStep,
    DeleteChannelStep,
    ReactToMessage,
    ReactToMessages,
]);

export const PlanSchema = Type.Object(
    {
        reason: Type.String(),
        steps: Type.Array(PlanStep, {
            maxItems: 5,
        }),
    },
    { additionalProperties: false },
);

export type Plan = Static<typeof PlanSchema>;
export type PlanStep = Static<typeof PlanStep>;

export function validatePlan(value: unknown): Plan {
    try {
        return Value.Parse(PlanSchema, value);
    } catch (err) {
        console.error(
            "Validation failed for proposed_plan: ",
            JSON.stringify(value, null, 2).slice(0, 5_000),
            err instanceof AssertError ? JSON.stringify(err.error) : undefined,
        );
        throw err;
    }
}
