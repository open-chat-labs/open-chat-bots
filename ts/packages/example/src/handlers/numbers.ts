import { Response } from "express";
import { argumentsInvalid } from "@open-ic/openchat-botclient-ts";
import { WithBotClient } from "../types";
import { success } from "./success";

export default async function (req: WithBotClient, res: Response) {
  const client = req.botClient;
  const intOne = client.integerArg("int_one");
  const intTwo = client.integerArg("int_two");
  const decOne = client.decimalArg("dec_one");
  const decTwo = client.decimalArg("dec_two");

  if (
    intOne !== undefined &&
    intTwo !== undefined &&
    decOne !== undefined &&
    decTwo !== undefined
  ) {
    const msg = await client.createTextMessage(
      `${intOne} * ${intTwo} * ${decOne} * ${decTwo} = ${
        Number(intOne) * Number(intTwo) * decOne * decTwo
      }`
    );
    msg.setFinalised(true);

    client
      .sendMessage(msg)
      .catch((err: unknown) =>
        console.error("sendTextMessage failed with: ", err)
      );

    res.status(200).json(success(msg));
  } else {
    res.status(400).send(argumentsInvalid());
  }
}
