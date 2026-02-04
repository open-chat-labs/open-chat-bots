import { BotClient, InstallationLocation } from "@open-ic/openchat-botclient-ts";
import OpenAI from "openai";
import { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources";
import { ChatMessage, ScheduleConfig } from "../types";
import { getRecentMessages } from "./messageRetriever";
import { DigestScheduler } from "./scheduler";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function formatMessagesForPrompt(messages: ChatMessage[]): string {
    return messages
        .map((m) => {
            const date = new Date(Number(m.timestamp) / 1000000);
            return `[${date.toLocaleString()}] user: @UserId(${m.sender}): ${m.text}`;
        })
        .join("\n");
}

const getRecentMessagesTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "get_recent_messages",
        description: "Retrieve recent messages from an OpenChat chat to analyze and summarize",
        parameters: {
            type: "object",
            properties: {
                count: {
                    type: "number",
                    description: "Number of messages to retrieve (1-300)",
                },
            },
            required: ["count"],
        },
    },
};

const scheduleSummaryTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "schedule_summary",
        description: "Schedule automatic recurring summaries of chat activity",
        parameters: {
            type: "object",
            properties: {
                message_count: {
                    type: "number",
                    description: "Number of messages to summarize each time",
                },
                frequency: {
                    type: "string",
                    enum: ["daily", "weekly", "interval"],
                    description: "How often to generate summaries",
                },
                time: {
                    type: "string",
                    description:
                        "Time in 24-hour format (e.g., '09:00') for daily/weekly schedules",
                },
                day_of_week: {
                    type: "number",
                    description: "Day of week (0=Sunday, 1=Monday, etc.) for weekly schedules",
                },
                interval_hours: {
                    type: "number",
                    description: "Interval in hours for interval-based schedules",
                },
            },
            required: ["message_count", "frequency"],
        },
    },
};

async function getFormattedMessages(client: BotClient, messageCount: number): Promise<string> {
    const messages = await getRecentMessages(client, messageCount);

    if (messages.length === 0) {
        return "No messages found.";
    }

    return formatMessagesForPrompt(messages);
}

export async function handleSummariseCommand(client: BotClient, prompt: string): Promise<string> {
    try {
        const messages: ChatCompletionMessageParam[] = [
            {
                role: "system",
                content: `You are a chat summarizer for OpenChat. When asked to summarize messages:
1. Use the get_recent_messages function to retrieve the requested number of messages
2. The messages will include user identifiers in the format: @UserId(xxxxx-xxxxx-xxxxx)
3. CRITICAL: When mentioning who said something, you MUST preserve the EXACT @UserId(...) format from the messages
   - Example: If the message shows "@UserId(abc12-def34-ghi56)", write "@UserId(abc12-def34-ghi56)" in your summary
   - NEVER replace with generic terms like "a user", "someone", or "user abc12"
   - Copy the @UserId(...) exactly as it appears - this is essential for the system to work
4. Create a concise summary (max 300 words) that:
   - Identifies main topics and themes
   - Highlights key decisions or conclusions
   - Notes any action items or questions
   - Uses markdown formatting for better readability
5. Be objective and factual in your summary`,
            },
            {
                role: "user",
                content: prompt,
            },
        ];

        let response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages,
            tools: [getRecentMessagesTool],
            tool_choice: "auto",
        });

        while (response.choices[0].finish_reason === "tool_calls") {
            const toolCalls = response.choices[0].message.tool_calls;
            if (!toolCalls) break;

            messages.push(response.choices[0].message);

            for (const toolCall of toolCalls) {
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
            }

            response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-4o-mini",
                messages,
                tools: [getRecentMessagesTool],
                tool_choice: "auto",
            });
        }

        const summary =
            response.choices[0].message.content || "Unable to generate summary. Please try again.";

        return summary;
    } catch (error) {
        console.error("Error in handleSummariseCommand:", error);
        throw error;
    }
}

export async function handleScheduleCommand(
    client: BotClient,
    prompt: string,
    scheduler: DigestScheduler,
    location: InstallationLocation,
): Promise<string> {
    try {
        const messages: ChatCompletionMessageParam[] = [
            {
                role: "system",
                content: `You are a scheduling assistant for OpenChat message summaries. When asked to schedule summaries:
1. Use the schedule_summary function to set up the schedule
2. Extract the message count and schedule details from the user's request
3. For daily schedules, extract the time (e.g., "9am" -> time: "09:00")
4. For weekly schedules, extract the day and time (e.g., "Monday at 2pm" -> day_of_week: 1, time: "14:00")
5. For interval schedules, extract the hours (e.g., "every 3 hours" -> interval_hours: 3)
6. Confirm the schedule with the user

Examples:
- "last 200 messages every morning" -> message_count: 200, frequency: "daily", time: "09:00"
- "summarize 100 messages every Monday at 2pm" -> message_count: 100, frequency: "weekly", day_of_week: 1, time: "14:00"
- "digest last 50 messages every 6 hours" -> message_count: 50, frequency: "interval", interval_hours: 6`,
            },
            {
                role: "user",
                content: prompt,
            },
        ];

        let response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages,
            tools: [scheduleSummaryTool],
            tool_choice: "auto",
        });

        while (response.choices[0].finish_reason === "tool_calls") {
            const toolCalls = response.choices[0].message.tool_calls;
            if (!toolCalls) break;

            messages.push(response.choices[0].message);

            for (const toolCall of toolCalls) {
                if (toolCall.function.name === "schedule_summary") {
                    const args = JSON.parse(toolCall.function.arguments);

                    const scheduleConfig: ScheduleConfig = {
                        messageCount: args.message_count,
                        frequency: args.frequency,
                        time: args.time,
                        dayOfWeek: args.day_of_week,
                        intervalHours: args.interval_hours,
                    };

                    const success = await scheduler.scheduleDigest(location, scheduleConfig);

                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: JSON.stringify({
                            success,
                            message: success
                                ? "Schedule created successfully"
                                : "Failed to create schedule. Check bot permissions.",
                        }),
                    });
                }
            }

            response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-4o-mini",
                messages,
                tools: [scheduleSummaryTool],
                tool_choice: "auto",
            });
        }

        return (
            response.choices[0].message.content || "Unable to set up schedule. Please try again."
        );
    } catch (error) {
        console.error("Error in handleScheduleCommand:", error);
        throw error;
    }
}
