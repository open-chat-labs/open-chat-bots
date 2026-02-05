/**
 * This bot is capable of queries _and_ commands. We can allow the AI to formulate a plan using readonly tools,
 * but we cannot allow it to perform commands without first presenting a plan and getting user approval
 *
 * So the way this works is that we send the prompt with all the readonly tools plus one extra tool that
 * allows the AI to present a plan.
 */
