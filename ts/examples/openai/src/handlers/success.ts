import { Message } from "@open-ic/openchat-botclient-ts";

//@ts-ignore
// Uint8Array.prototype.toJSON = function () {
//   return {
//     type: "Uint8Array",
//     bytes: Array.from(this),
//   };
// };

export function success(msg?: Message) {
  return {
    message: msg?.toResponse(),
  };
}
