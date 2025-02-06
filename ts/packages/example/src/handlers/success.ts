import { Message } from "@open-ic/openchat-botclient-ts";

export function success<M>(msg?: Message<M>) {
  return {
    message: msg?.toResponse(),
  };
}
