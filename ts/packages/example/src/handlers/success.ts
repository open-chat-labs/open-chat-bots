import { Message } from "@open-ic/openchat-botclient-ts";

export function success(msg?: Message) {
  return {
    message: msg,
  };
}
