import { Principal } from "@dfinity/principal";
import { describe, expect, test } from "vitest";
import { validateMiniAppContent } from "../domain/message";
import { Lobby, lobbyErrorMessage, type LobbyError, type LobbyResult } from "./lobby";

function user(byte: number): string {
    return Principal.fromUint8Array(new Uint8Array([byte])).toText();
}

const SUCCESS: LobbyResult = { kind: "success" };

function error(error: LobbyError): LobbyResult {
    return { kind: "error", error };
}

// A lobby for 2 to 3 players, hosted by user 1
function lobby(): Lobby {
    return new Lobby(user(1), 2, 3);
}

describe("Lobby", () => {
    test("the host is the first player", () => {
        const l = lobby();

        expect(l.players).toEqual([user(1)]);
        expect(l.state).toBe("open");
    });

    test("players join until it's full", () => {
        const l = lobby();

        expect(l.join(user(2))).toEqual(SUCCESS);
        expect(l.join(user(2))).toEqual(error("already_joined"));
        expect(l.join(user(1))).toEqual(error("already_joined"));
        expect(l.join(user(3))).toEqual(SUCCESS);
        expect(l.join(user(4))).toEqual(error("full"));
        expect(l.players).toEqual([user(1), user(2), user(3)]);
    });

    test("players but not the host can leave", () => {
        const l = lobby();
        l.join(user(2));
        l.join(user(3));

        expect(l.leave(user(2))).toEqual(SUCCESS);
        expect(l.leave(user(2))).toEqual(error("not_a_player"));
        expect(l.leave(user(4))).toEqual(error("not_a_player"));
        expect(l.leave(user(1))).toEqual(error("host_cant_leave"));
        expect(l.players).toEqual([user(1), user(3)]);
    });

    test("only the host starts it, once enough have joined", () => {
        const l = lobby();

        expect(l.start(user(1))).toEqual(error("too_few_players"));
        l.join(user(2));
        expect(l.start(user(2))).toEqual(error("not_the_host"));
        expect(l.start(user(3))).toEqual(error("not_the_host"));
        expect(l.state).toBe("open");
        expect(l.start(user(1))).toEqual(SUCCESS);
        expect(l.state).toBe("started");
    });

    test("nothing changes once it's started", () => {
        const l = lobby();
        l.join(user(2));
        l.start(user(1));

        expect(l.join(user(3))).toEqual(error("already_started"));
        expect(l.leave(user(2))).toEqual(error("already_started"));
        expect(l.start(user(1))).toEqual(error("already_started"));
        expect(l.players).toEqual([user(1), user(2)]);
    });

    test("needs at least one player, and room for its minimum", () => {
        expect(() => new Lobby(user(1), 0, 2)).toThrow();
        expect(() => new Lobby(user(1), 3, 2)).toThrow();
        expect(() => new Lobby(user(1), 1.5, 2)).toThrow();
        expect(() => new Lobby(user(1), 1, 1)).not.toThrow();
    });

    test("words each error for the player", () => {
        expect(lobbyErrorMessage("not_the_host")).toBe("Only the host can start the game");
        expect(lobbyErrorMessage("full")).toBe("The game is full");
    });

    test("an open lobby shows its players and buttons", () => {
        const l = lobby();
        const host = user(1);
        const content = l.render("Tic-tac-toe");

        expect(content.kind).toBe("mini_app_content");
        expect(content.text).toBe(
            `**Tic-tac-toe**\nPlayers (1 of 3): @UserId(${host}) (host)\nWaiting for 1 more player`,
        );
        expect(content.buttonRows).toHaveLength(1);
        const [row] = content.buttonRows;
        expect(row.map((b) => b.id)).toEqual([Lobby.JOIN, Lobby.LEAVE, Lobby.START]);
        expect(row[0].visibleTo).toBeUndefined();
        expect(row[1].visibleTo).toBeUndefined();
        expect(row[2].visibleTo).toEqual([host]);
        expect(validateMiniAppContent(content)).toBeUndefined();

        l.join(user(2));
        expect(l.render("Tic-tac-toe").text).toBe(
            `**Tic-tac-toe**\nPlayers (2 of 3): @UserId(${host}) (host), @UserId(${user(2)})\nWaiting for @UserId(${host}) to start`,
        );
    });

    test("a started lobby has no buttons", () => {
        const l = new Lobby(user(1), 3, 4);
        expect(l.render("Uno").text.endsWith("Waiting for 2 more players")).toBe(true);

        l.join(user(2));
        l.join(user(3));
        l.start(user(1));
        const content = l.render("Uno");

        expect(content.text.endsWith("\nThe game has started")).toBe(true);
        expect(content.buttonRows).toEqual([]);
        expect(validateMiniAppContent(content)).toBeUndefined();
    });

    // User ids are canister ids, of 10 bytes
    test("a lobby of 40 is within the limits", () => {
        const id = (i: number) => Principal.fromUint8Array(new Uint8Array(10).fill(i)).toText();
        const l = new Lobby(id(1), 2, 40);
        for (let i = 2; i <= 40; i++) {
            expect(l.join(id(i))).toEqual(SUCCESS);
        }

        expect(validateMiniAppContent(l.render("x".repeat(100)))).toBeUndefined();
    });

    test("survives a round trip through JSON", () => {
        const l = lobby();
        l.join(user(2));
        l.start(user(1));

        const copy = Lobby.fromJSON(JSON.parse(JSON.stringify(l)));

        expect(copy).toEqual(l);
        expect(copy.join(user(3))).toEqual(error("already_started"));
    });
});
