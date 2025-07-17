import { MemberType } from "@open-ic/openchat-botclient-ts";
import { Response } from "express";
import { WithBotClient } from "../types";
import { ephemeralMsg } from "./helpers";
import { success } from "./success";

export async function chatMembers(req: WithBotClient, res: Response) {
  const client = req.botClient;
  const memberType = (client.stringArg("member_type") ??
    "Member") as MemberType;

  const response = await client.members([memberType]);
  if (response.kind === "success") {
    res.status(200).json(
      success(
        await ephemeralMsg(
          client,
          `${response.members
            .get(memberType)
            ?.map((u) => `@UserId(${u})`)
            ?.join(", ")}`
        )
      )
    );
  } else {
    res
      .status(200)
      .json(
        success(
          await ephemeralMsg(
            client,
            "Sorry we were unable to get the chat members"
          )
        )
      );
  }
}

export async function communityMembers(req: WithBotClient, res: Response) {
  const client = req.botClient;
  const memberType = (client.stringArg("member_type") ??
    "Member") as MemberType;

  if (client.scope.isChatScope()) {
    if (client.scope.chat.isChannel()) {
      const response = await client.members([memberType]);
      if (response.kind === "success") {
        res.status(200).json(
          success(
            await ephemeralMsg(
              client,
              `${response.members
                .get(memberType)
                ?.map((u) => `@UserId(${u})`)
                ?.join(", ")}`
            )
          )
        );
      } else {
        res
          .status(200)
          .json(
            success(
              await ephemeralMsg(
                client,
                "Sorry we were unable to get the chat members"
              )
            )
          );
      }
    } else {
      res
        .status(200)
        .json(
          success(
            await ephemeralMsg(
              client,
              "Can't get community members because this is not a community"
            )
          )
        );
    }
  }
}
