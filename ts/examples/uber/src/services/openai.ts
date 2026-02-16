import {
    BotClient,
    ChannelIdentifier,
    ChatActionScope,
    CommunityActionScope,
    CommunityIdentifier,
    Permissions,
} from "@open-ic/openchat-botclient-ts";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { factory } from "../factory";
import { ChatMessage } from "../types";
import { changeRole } from "./changeRole";
import { chatSummary } from "./chatSummary";
import { communitySummary } from "./communitySummary";
import { createChannel } from "./createChannel";
import { deleteChannel } from "./deleteChannel";
import { getMessageUrl } from "./getMessageUrl";
import { inviteUsers } from "./inviteUsers";
import { deleteMessage } from "./messageDeleter";
import { reactToMessage } from "./messageReactor";
import { getRecentMessages } from "./messageRetriever";
import { validatePlan } from "./planSchema";
import { proposePlan } from "./planStore";
import { getTheRules } from "./rulesRetriever";
import { allTools } from "./tools";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function formatMessagesForPrompt(messages: ChatMessage[]): string {
    return messages
        .map((m) => {
            const date = new Date(Number(m.timestamp) / 1000000);
            return `[${date.toLocaleString()}] user: @UserId(${m.sender}): ${m.text}`;
        })
        .join("\n");
}

async function getFormattedMessages(client: BotClient, messageCount: number): Promise<string> {
    const messages = await getRecentMessages(client, messageCount);
    return JSON.stringify(messages);
}

export async function handleCommand(client: BotClient, prompt: string): Promise<string> {
    const messageId = client.messageId;
    const initiator = client.initiator;

    if (messageId === undefined) {
        return "Unable to process command because messageId is missing";
    }

    if (initiator === undefined) {
        return "Unable to process command because initiator is missing";
    }

    try {
        const messages: ChatCompletionMessageParam[] = [
            {
                role: "system",
                content: `You are a handy abstraction layer over the OpenChat bot sdk. Your job is to parse the user's request and convert it into one or more supplied tool calls.
1. Messages and tool responses may include user identifiers in the format: @UserId(xxxxx-xxxxx-xxxxx)
2. CRITICAL: When mentioning who said something, you MUST preserve the EXACT @UserId(...) format from the messages
   - Example: If the message shows "@UserId(abc12-def34-ghi56)", write "@UserId(abc12-def34-ghi56)" in your summary
   - NEVER replace with generic terms like "a user", "someone", or "user abc12"
   - Copy the @UserId(...) exactly as it appears - this is essential for the system to work
3. Be objective and factual in your own messages
5. When asked for recent messages get the last 50 messages by default.
6. Use get_rules tool to find out the rules in the current context
7. You should consider the words Group and Channel to by synonymous with Chat
8. When you receive something that looks like a proposal_plan, summarise it concisely with bullet points and add the phrase "Approve 👍 or Reject 👎 this plan".
CRITICAL TOOL CONSTRAINTS:
- You may use tools to acquire the information required to build a propsal_plan
- You must only handle prompts that use relate to OpenChat and result in tool calls for the supplied tools. If you cannot resolve with tool calls, just say so.
- When calling propose_plan, each step MUST be one of the explicitly defined action schemas.
- When you need to refer to a specific message in a proposal plan summary, please use the getMessageUrl tool to build a suitable url. Do not print out the message id.
- Each step MUST include a "action" field.
- The "action" field MUST be exactly one of the following strings:
  - "create_channel"
  - "delete_channel"
  - "change_role"
  - "delete_message"
  - "reply_to_message"
  - "react_to_message"
  - "react_to_messages"
- Use a single bulk tool call rather than repeatedly calling an individual tool if possible e.g. use react_to_messages once rather than react_to_message n times
- NO other "action" values are allowed.
- Do NOT invent new step actions.
- Do NOT use descriptive or generic actions such as "message", "channel", "user", or similar.
- If none of the allowed step actions apply, do NOT call propose_plan and explain why instead.
`,
            },
            {
                role: "user",
                content: prompt,
            },
        ];

        let response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages,
            tools: allTools,
            tool_choice: "auto",
        });

        while (response.choices[0].finish_reason === "tool_calls") {
            const toolCalls = response.choices[0].message.tool_calls;
            if (!toolCalls) break;

            messages.push(response.choices[0].message);

            for (const toolCall of toolCalls) {
                if (toolCall.function.name === "get_message_url") {
                    const args = JSON.parse(toolCall.function.arguments);
                    const url = getMessageUrl(client.scope as ChatActionScope, args.messageIndex);
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: url,
                    });
                }

                if (toolCall.function.name === "get_recent_messages") {
                    const args = JSON.parse(toolCall.function.arguments);
                    const count = args.count || 50;
                    const formattedMessages = await getFormattedMessages(client, count);
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: formattedMessages,
                    });
                }

                if (toolCall.function.name === "react_to_message") {
                    const args = JSON.parse(toolCall.function.arguments);
                    const result = await reactToMessage(
                        client,
                        BigInt(args.messageId),
                        args.reaction,
                    );
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: result,
                    });
                }

                if (toolCall.function.name === "delete_message") {
                    const args = JSON.parse(toolCall.function.arguments);
                    console.log("Delete message", args);
                    const result = await deleteMessage(client, BigInt(args.messageId));
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: result,
                    });
                }

                if (toolCall.function.name === "get_rules") {
                    const result = await getTheRules(client);
                    console.log("Getting the rules", result);
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result),
                    });
                }

                if (toolCall.function.name === "change_role") {
                    const args = JSON.parse(toolCall.function.arguments);
                    const result = await changeRole(client, args.userId, args.role);
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result),
                    });
                }

                if (toolCall.function.name === "delete_channel") {
                    // I _think_ this will only be able to delete channels that the bot created
                    const args = JSON.parse(toolCall.function.arguments);
                    if (client.scope.isChatScope() && client.scope.chat.isChannel()) {
                        const channelId = new ChannelIdentifier(
                            client.scope.chat.communityId,
                            BigInt(args.channelId),
                        );
                        const result = await deleteChannel(client, channelId);
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(result),
                        });
                    }
                }

                if (toolCall.function.name === "propose_plan") {
                    try {
                        const planJson = JSON.parse(toolCall.function.arguments);
                        const plan = validatePlan(planJson);
                        proposePlan(initiator, messageId, plan);

                        // we will store the plan against the message we are about to write
                        // and then serialise  human readable version to the message
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(toolCall.function.arguments),
                        });
                    } catch (err) {
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(err),
                        });
                    }
                }

                if (toolCall.function.name === "create_channel") {
                    if (client.scope.isChatScope() && client.scope.chat.isChannel()) {
                        // This is super hacky - for some reason we need to have a CommunityActionScope
                        // to run createChannel. I'm not sure why that is but this works although it
                        // means that for this tool call we are strictly speaking operating autonomously.
                        const communityScope = new CommunityActionScope(
                            new CommunityIdentifier(client.scope.chat.communityId),
                        );
                        const communityClient = factory.createClientInAutonomouseContext(
                            communityScope,
                            client.apiGateway,
                            new Permissions(
                                Permissions.encodePermissions({
                                    community: ["CreatePrivateChannel", "CreatePublicChannel"],
                                    chat: [],
                                    message: [],
                                }),
                            ),
                        );
                        const results = [];
                        const args = JSON.parse(toolCall.function.arguments);
                        const createResult = await createChannel(
                            communityClient,
                            args.name,
                            args.description,
                            args.isPublic,
                        );
                        results.push(createResult);
                        if (createResult.kind === "success" && initiator) {
                            // if it worked, invite the initiator
                            const invitedResult = await inviteUsers(
                                communityClient,
                                [client.initiator],
                                createResult.channelId,
                            );
                            results.push(invitedResult);
                        }
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(results),
                        });
                    } else {
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content:
                                "You must be within the scope of a community to create a channel",
                        });
                    }
                }

                if (toolCall.function.name === "chat_summary") {
                    const result = await chatSummary(client);
                    console.log("Getting the chat summary", result);
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result),
                    });
                }

                if (toolCall.function.name === "community_summary") {
                    const result = await communitySummary(client);
                    console.log("Getting the community summary", result);
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result),
                    });
                }
            }

            response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-4o-mini",
                messages,
                tools: allTools,
                tool_choice: "auto",
            });
        }

        const summary =
            response.choices[0].message.content || "Unable to process query. Please try again.";

        return summary;
    } catch (error) {
        console.error("Error handling user query:", error);
        throw error;
    }
}
