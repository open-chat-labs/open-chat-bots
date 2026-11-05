// A duel's page: the game's board between its two players, each with a clock counting down from the
// state's `clock.at`, whose move it is, and Resign. Once the game's over, it says how it ended, and
// Previous and Next, or the arrow keys, step through the moves. The board is the game's own: it's
// replayed from the moves with the rules the bot uses, and drawn by the game's `DuelBoard`. A
// player's move goes to the bot, whose answer is shown until OpenChat relays the next state.
//
// Players are named by their usernames as they are now, from the bot, as the card names them with
// a mention; until the bot says, by the names the state carries.
import { FIRST_IS_HOST, FIRST_IS_OPPONENT } from "../../games/duel/settings";
import {
    describeEnding,
    replay,
    type ActionResponse,
    type DuelRules,
    type DuelState,
    type Position,
    type Seat,
} from "../../games/duel/types";
import { escape, formatClock, formatFirstMove, shortId } from "../format";
import { roomFor } from "../layout";
import { fetchUsernames, nameOf } from "../names";
import type { GameView, Lobby, ViewContext } from "../view";

const LOW_TIME_MS = 20_000;
const RESIGN_CONFIRM_MS = 4000;

/** What a game draws of a duel: its board, and what a tap on it plays */
export type DuelBoard<M, P extends Position<M>> = {
    /** The board's own class, under `.duel`, eg. "grid" */
    className: string;
    /** The board's width over its height, so it's as big as the frame allows */
    ratio: number;
    /**
     * Draws the position into `board`. When `playable`, an element a tap plays carries
     * `data-action="play"` and `data-move`. `last` is the move that made the position, if any, and
     * `fresh` says it was just played, so it can be animated; `mine` is the viewer's seat, if any.
     */
    draw(
        board: HTMLElement,
        position: P,
        options: { playable: boolean; last: M | undefined; fresh: boolean; mine: Seat | undefined },
    ): void;
    /** The move a tapped element with `data-move` stands for */
    moveOf(el: HTMLElement): M | undefined;
    /** What a seat has on the board, eg. Reversi's discs, shown by the player's name */
    score?(position: P, seat: Seat): number;
    /** Something about the position worth saying under whose move it is, eg. that a player passed */
    note?(position: P, name: (seat: Seat) => string): string | undefined;
    /**
     * Moves that aren't on the board, eg. Hex's swap, which the player to move gets as buttons
     * beside Resign: a button carries `data-move` with the move, as `moveOf` reads it
     */
    extraMoves?(position: P): { move: M; label: string }[];
};

type Dom = {
    root: HTMLElement;
    status: HTMLElement;
    /** The time left for a first move, which the status ends with while one's awaited */
    firstMove: HTMLElement;
    note: HTMLElement;
    rows: [HTMLElement, HTMLElement];
    board: HTMLElement;
    controls: HTMLElement;
    extra: HTMLElement;
    resign: HTMLButtonElement;
    replay: HTMLElement;
    previous: HTMLButtonElement;
    next: HTMLButtonElement;
    ply: HTMLElement;
    error: HTMLElement;
};

export function duelView<M, P extends Position<M>>(
    rules: DuelRules<M, P>,
    board: DuelBoard<M, P>,
): GameView {
    let ctx: ViewContext | undefined;
    let dom: Dom | undefined;
    /** The live state shown, until the game's over */
    let shared: DuelState<M> | undefined;
    /** The bot's answer to the player's last request, shown until OpenChat sends a newer state */
    let pending: { shared: DuelState<M>; seq: number | undefined } | undefined;
    /** How the game ended, from the card, and the object it was read from */
    let end: DuelState<M> | undefined;
    let endSource: unknown;
    /** In a finished game, how many of its moves are shown */
    let ply = 0;
    /** How many moves the board showed last, so that only a move just made is animated */
    let drawn = -1;
    /** A request on its way to the bot, during which the board takes no taps */
    let sending = false;
    let resignArmed: ReturnType<typeof setTimeout> | undefined;
    /** What the extra moves' buttons were last drawn as */
    let extraDrawn = "";

    const current = () => end ?? shared;

    function name(s: DuelState<M>, id: string | undefined): string {
        return nameOf(id, s.names, "A player");
    }

    /** The viewer's seat, if they play in this game */
    function mySeat(s: DuelState<M>): Seat | undefined {
        const oc = ctx?.oc;
        if (oc === undefined || oc.role !== "player" || s.phase === "open") return undefined;
        const index = s.players.indexOf(oc.userId);
        return index === 0 || index === 1 ? index : undefined;
    }

    function readEnd(value: unknown): DuelState<M> | undefined {
        if (value === null || typeof value !== "object") return undefined;
        const s = value as Partial<DuelState<M>>;
        if (
            s.game !== rules.kind ||
            s.version !== rules.version ||
            !Array.isArray(s.moves) ||
            !Array.isArray(s.players) ||
            s.ending === undefined
        ) {
            return undefined;
        }
        try {
            replay(rules, s.moves, s.settings ?? {});
        } catch {
            return undefined;
        }
        return { ...s, names: s.names ?? {}, settings: s.settings ?? {} } as DuelState<M>;
    }

    function ensureDom(body: HTMLElement) {
        if (dom !== undefined && body.contains(dom.root)) return;
        const row = (seat: Seat) =>
            `<div class="player-row" data-seat="${seat}"><span class="name"></span><span class="duel-clock"></span></div>`;
        body.innerHTML = `
            <div class="duel duel-${board.className}">
                <p class="duel-status"></p>
                <p class="duel-note"></p>
                ${row(1)}
                <div class="duel-board ${board.className}" role="grid" aria-label="${rules.title}"></div>
                ${row(0)}
                <div class="duel-controls" hidden>
                    <span class="duel-extra"></span>
                    <button type="button" data-action="resign">Resign</button>
                </div>
                <div class="replay-row" hidden>
                    <button type="button" data-action="previous">‹ Previous</button>
                    <span class="ply"></span>
                    <button type="button" data-action="next">Next ›</button>
                </div>
                <p class="duel-error" role="alert"></p>
            </div>`;
        const root = body.firstElementChild as HTMLElement;
        const q = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
        const rows = root.querySelectorAll<HTMLElement>(".player-row");
        dom = {
            root,
            status: q(".duel-status"),
            firstMove: Object.assign(document.createElement("span"), { className: "first-move" }),
            note: q(".duel-note"),
            // The row under the board first: the viewer's, or the first to move's
            rows: [rows[1], rows[0]],
            board: q(".duel-board"),
            controls: q(".duel-controls"),
            extra: q(".duel-extra"),
            resign: q('[data-action="resign"]'),
            replay: q(".replay-row"),
            previous: q('[data-action="previous"]'),
            next: q('[data-action="next"]'),
            ply: q(".ply"),
            error: q(".duel-error"),
        };
        dom.board.style.aspectRatio = String(board.ratio);
        drawn = -1;
        extraDrawn = "";
    }

    function canMove(s: DuelState<M>, position: P): boolean {
        return (
            !sending &&
            end === undefined &&
            ctx?.oc.finished !== true &&
            s.phase === "active" &&
            mySeat(s) === position.turn
        );
    }

    // Calls the bot with the player's token. Its answer is shown until OpenChat relays the next.
    async function call(action: "move" | "resign", body?: unknown) {
        if (ctx === undefined) return;
        showError("");
        sending = true;
        render();
        try {
            const response = await ctx.oc.fetch(`/api/${rules.kind}/${action}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body ?? {}),
            });
            const result = (await response.json().catch(() => undefined)) as
                | ActionResponse<M>
                | undefined;
            if (result === undefined) throw new Error(`The bot answered ${response.status}`);
            if (!result.ok) throw new Error(result.error);
            pending = { shared: result.shared, seq: ctx.oc.state?.seq };
            shared = result.shared;
        } catch (err) {
            showError(err instanceof Error ? err.message : "Couldn't reach the game");
        } finally {
            sending = false;
            render();
        }
    }

    function showError(text: string) {
        if (dom !== undefined) dom.error.textContent = text;
    }

    function disarmResign() {
        clearTimeout(resignArmed);
        resignArmed = undefined;
        if (dom !== undefined) dom.resign.textContent = "Resign";
    }

    function canStep(): boolean {
        return end !== undefined && end.moves.length > 0;
    }

    function step(to: number) {
        if (end === undefined || !canStep()) return;
        ply = Math.max(0, Math.min(end.moves.length, to));
        render();
    }

    function render() {
        const s = current();
        if (dom === undefined || s === undefined || ctx === undefined) return;
        if (s.phase !== "open") fetchUsernames(ctx, s.players);
        const moves = end !== undefined ? end.moves.slice(0, ply) : s.moves;
        const position = replay(rules, moves, s.settings);
        const mine = mySeat(s);
        const playable = canMove(s, position);

        // What's happening, or how it ended
        if (s.ending !== undefined) {
            const final = end !== undefined ? replay(rules, end.moves, end.settings) : position;
            dom.status.textContent = describeEnding(rules, s.ending, final, (seat) =>
                name(s, s.players[seat]),
            );
        } else if (s.phase === "open") {
            dom.status.textContent = "Waiting for the game to start";
        } else if (s.clock?.firstMoveMs !== undefined) {
            // A first move's clock doesn't run, but it has to be made in time, counted down here
            dom.status.textContent =
                mine === position.turn
                    ? "Your first move"
                    : `${name(s, s.players[position.turn])}'s first move`;
            dom.status.append(dom.firstMove);
        } else {
            dom.status.textContent =
                mine === position.turn
                    ? "Your move"
                    : `${name(s, s.players[position.turn])} to move`;
        }

        dom.note.textContent =
            s.phase === "open"
                ? ""
                : (board.note?.(position, (seat) => name(s, s.players[seat])) ?? "");

        // The viewer's seat at the bottom, or the first to move if they're watching
        const bottom: Seat = mine ?? 0;
        // Whose turn it is, whether or not their clock's running yet
        const toMove = s.phase === "active" && end === undefined ? position.turn : null;
        for (const [i, row] of dom.rows.entries()) {
            const seat = (i === 0 ? bottom : 1 - bottom) as Seat;
            row.dataset.seat = String(seat);
            const id = s.phase === "open" ? undefined : s.players[seat];
            const score =
                board.score === undefined || s.phase === "open"
                    ? ""
                    : `<span class="score">${board.score(position, seat)}</span>`;
            row.querySelector(".name")!.innerHTML =
                `<span class="disc-swatch seat-${seat}"></span>${escape(name(s, id))}${score}`;
            row.classList.toggle("active", toMove === seat);
            (row.querySelector(".duel-clock") as HTMLElement).hidden = end !== undefined;
        }

        board.draw(dom.board, position, {
            playable,
            last: moves.at(-1),
            fresh: moves.length === drawn + 1,
            mine,
        });
        drawn = moves.length;

        const playing =
            mine !== undefined &&
            s.phase === "active" &&
            end === undefined &&
            ctx.oc.finished !== true;
        dom.controls.hidden = !playing;
        dom.resign.disabled = sending;
        const extra = playable ? (board.extraMoves?.(position) ?? []) : [];
        const extraHtml = extra
            .map(
                ({ move, label }) =>
                    `<button type="button" data-action="play" data-move="${escape(String(move))}">${escape(label)}</button>`,
            )
            .join("");
        // Replaced only when it's changed, so a press on a button isn't lost to a redraw
        if (extraDrawn !== extraHtml) {
            extraDrawn = extraHtml;
            dom.extra.innerHTML = extraHtml;
        }
        if (!playing) disarmResign();

        const stepping = canStep();
        dom.replay.hidden = !stepping;
        if (stepping && end !== undefined) {
            dom.previous.disabled = ply === 0;
            dom.next.disabled = ply === end.moves.length;
            dom.ply.textContent = ply === 0 ? "Start" : `Move ${ply} of ${end.moves.length}`;
        }
        tickClocks();
        fitBoard();
    }

    // What each side has left: the state's figure, less the time since the bot took it for the side
    // whose clock is running, taking the bot's clock and the viewer's to agree
    function tickClocks() {
        const s = current();
        if (dom === undefined || end !== undefined || !document.body.contains(dom.root)) return;
        const clock = s?.clock;
        for (const row of dom.rows) {
            const text = row.querySelector(".duel-clock") as HTMLElement;
            const seat = Number(row.dataset.seat) as Seat;
            let ms = clock?.ms[seat] ?? (s?.settings.minutes ?? 0) * 60_000;
            if (clock !== undefined && clock.running === seat) {
                ms = Math.max(0, ms - Math.max(0, Date.now() - clock.at));
            }
            text.textContent = formatClock(ms);
            text.classList.toggle("low", clock?.running === seat && ms < LOW_TIME_MS);
        }
        if (clock?.firstMoveMs !== undefined) {
            const ms = Math.max(0, clock.firstMoveMs - Math.max(0, Date.now() - clock.at));
            dom.firstMove.textContent = ` · ${formatFirstMove(ms)} left`;
            dom.firstMove.classList.toggle("low", ms < LOW_TIME_MS);
        }
    }

    // The board is as wide as the frame unless the rows around it leave less height than its
    // ratio needs: then it's as tall as they leave, so nothing's cut off in the card's frame
    function fitBoard() {
        if (dom === undefined || !document.body.contains(dom.root)) return;
        const height = Math.max(140, roomFor(dom.root, [dom.board]));
        dom.board.style.setProperty("--board-max", `${Math.floor(height * board.ratio)}px`);
    }

    return {
        id: rules.kind,
        title: rules.title,
        stateVersion: rules.version,

        attach(_root, context) {
            ctx = context;
            setInterval(tickClocks, 200);
            window.addEventListener("resize", fitBoard);
        },

        isOpen(state) {
            return (state as DuelState<M>).phase === "open";
        },

        lobby(state): Lobby {
            const s = state as DuelState<M>;
            const { first, minutes } = s.settings;
            const host = s.host === undefined ? undefined : (s.names[s.host] ?? shortId(s.host));
            // The host goes first, or their opponent does, only if the host plays
            const ifJoined =
                s.host !== undefined && s.players.includes(s.host) ? "" : " if they join";
            const firstText =
                first === FIRST_IS_HOST && host !== undefined
                    ? `<strong>${escape(host)}</strong> goes first${ifJoined}`
                    : first === FIRST_IS_OPPONENT && host !== undefined
                      ? `<strong>${escape(host)}</strong>'s opponent goes first${ifJoined}`
                      : "who goes first is chosen at random";
            const own = rules.lobbyText?.(s.settings);
            return {
                blurb: `${own === undefined ? "" : `${own} `}<strong>${minutes} minute${minutes === 1 ? "" : "s"}</strong> each, and ${firstText}.`,
                seats: s.players.map((id) => ({ id, name: s.names[id] ?? shortId(id) })),
                hint: "Start once you're both here.",
                host: s.host,
                hostName: s.host === undefined ? undefined : s.names[s.host],
                settings: { specs: rules.settings, current: s.settings },
            };
        },

        renderLive(body, state) {
            const live = state as DuelState<M>;
            // The bot's answer to the player's own request is newer than the state OpenChat has
            // relayed, until the next state comes
            if (pending !== undefined && pending.seq !== ctx?.oc.state?.seq) pending = undefined;
            shared = pending?.shared ?? live;
            end = undefined;
            ensureDom(body);
            render();
        },

        renderEnd(body, endState) {
            const read = readEnd(endState);
            if (read === undefined) return false;
            if (endState !== endSource) {
                endSource = endState;
                end = read;
                // The final position first
                ply = read.moves.length;
                drawn = ply;
            }
            ensureDom(body);
            render();
            return true;
        },

        clock() {
            return "";
        },

        onKey(event) {
            if (!canStep()) return false;
            if (event.key === "ArrowLeft") step(ply - 1);
            else if (event.key === "ArrowRight") step(ply + 1);
            else return false;
            return true;
        },

        onAction(action, el) {
            const s = current();
            switch (action) {
                case "play": {
                    if (s === undefined || !canMove(s, replay(rules, s.moves, s.settings))) return;
                    const move = board.moveOf(el);
                    if (move !== undefined) void call("move", { move });
                    break;
                }
                case "resign":
                    // Resigning takes two taps, a few seconds apart at most: the frame has no dialogs
                    if (resignArmed === undefined) {
                        if (dom !== undefined) dom.resign.textContent = "Tap again to resign";
                        resignArmed = setTimeout(disarmResign, RESIGN_CONFIRM_MS);
                    } else {
                        disarmResign();
                        void call("resign");
                    }
                    break;
                case "previous":
                    step(ply - 1);
                    break;
                case "next":
                    step(ply + 1);
                    break;
            }
        },
    };
}
