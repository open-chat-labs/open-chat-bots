import { Request, Response } from "express";

const emptyPermissions = {
  chat: [],
  community: [],
  message: [],
};

export default function schema(_: Request, res: Response) {
  res.status(200).json({
    autonomous_config: {
      permissions: {
        message: ["Text", "Image", "P2pSwap", "VideoCall"],
        community: [
          "RemoveMembers",
          "ChangeRoles",
          "CreatePublicChannel",
          "CreatePrivateChannel",
        ],
        chat: [],
      },
    },
    description:
      "This is a demonstration bot which demonstrates a variety of different approaches and techniques that bot developers can use.",
    commands: [
      {
        name: "numbers",
        description: "Handle different types of numbers",
        permissions: {
          ...emptyPermissions,
          message: ["Text"],
        },
        params: [
          {
            name: "int_one",
            required: true,
            description: "First integer argument",
            placeholder: "Enter an integer",
            param_type: {
              IntegerParam: {
                min_value: -100,
                max_value: 100,
                choices: [],
              },
            },
          },
          {
            name: "dec_one",
            required: true,
            description: "First decimal argument",
            placeholder: "Enter a decimal",
            param_type: {
              DecimalParam: {
                min_value: -100,
                max_value: 100,
                choices: [],
              },
            },
          },
        ],
      },
      {
        name: "poll",
        description: "Send a random poll",
        permissions: {
          ...emptyPermissions,
          message: ["Poll"],
        },
        params: [],
      },
      {
        name: "start_ping",
        description: "Begin pinging OpenChat",
        permissions: {
          ...emptyPermissions,
          message: ["Text"],
        },
        params: [],
      },
      {
        name: "stop_ping",
        description: "Stop pinging OpenChat",
        permissions: {
          ...emptyPermissions,
          message: ["Text"],
        },
        params: [],
      },
      {
        name: "news",
        description: "Show a list of the current news headlines",
        placeholder: "Searching for the headlines ...",
        permissions: {
          ...emptyPermissions,
          message: ["Text"],
        },
        params: [],
      },
      {
        name: "image",
        description: "Post an image message",
        permissions: {
          ...emptyPermissions,
          message: ["Image"],
        },
        params: [],
      },
      {
        name: "file",
        description: "Post a file message",
        permissions: {
          ...emptyPermissions,
          message: ["File"],
        },
        params: [],
      },
      {
        name: "artist",
        description: "Search for an artist on Spotify",
        permissions: {
          ...emptyPermissions,
          message: ["Text"],
        },
        params: [
          {
            name: "artist",
            required: true,
            description: "The artist to search for",
            placeholder: "Enter artist name",
            param_type: {
              StringParam: {
                min_length: 1,
                max_length: 100,
                choices: [],
              },
            },
          },
        ],
      },
      {
        name: "song",
        description: "Search for a song on Spotify",
        placeholder: "Searching Spotify for your song ...",
        permissions: {
          ...emptyPermissions,
          message: ["Text"],
        },
        params: [
          {
            name: "song",
            required: true,
            description: "The song to search for",
            placeholder: "Enter song name",
            param_type: {
              StringParam: {
                min_length: 1,
                max_length: 100,
                choices: [],
              },
            },
          },
        ],
      },
      {
        name: "album",
        description: "Search for an album on Spotify",
        permissions: {
          ...emptyPermissions,
          message: ["Text"],
        },
        params: [
          {
            name: "album",
            required: true,
            description: "The album to search for",
            placeholder: "Enter album name",
            param_type: {
              StringParam: {
                min_length: 1,
                max_length: 100,
                choices: [],
              },
            },
          },
        ],
      },
    ],
  });
}
