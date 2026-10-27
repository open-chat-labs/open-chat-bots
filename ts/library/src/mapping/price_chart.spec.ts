import { Principal } from "@dfinity/principal";
import { Value } from "@sinclair/typebox/value";
import { Packr, type Options } from "msgpackr";
import { describe, expect, test } from "vitest";
import type { PriceChartContent } from "../domain";
import { PriceChartMessage } from "../domain/message";
import {
    MessageContent as ApiMessageContent,
    BotMessageContent as ApiBotMessageContent,
} from "../typebox/typebox";
import { messageContent, priceChartContent } from "./index";

const Packer = new Packr({
    useRecords: false,
    skipValues: [undefined],
    largeBigIntToString: true,
} as unknown as Options);

const ICP_LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const SENDER = "2yfsq-kaaaa-aaaaf-aaa4q-cai";

const chart: PriceChartContent = {
    kind: "price_chart_content",
    title: "ICP vs ADA · 2 days",
    start: 1_761_350_400_000,
    end: 1_761_523_200_000,
    series: [
        {
            token: { kind: "token", ledger: ICP_LEDGER },
            symbol: "ICP",
            name: "Internet Computer",
            points: [
                { timestamp: 1_761_350_400_000, usd: 3.12 },
                { timestamp: 1_761_436_800_000, usd: 3.05 },
            ],
        },
        {
            token: { kind: "coin", id: "cardano" },
            symbol: "ADA",
            name: "Cardano",
            points: [
                { timestamp: 1_761_350_400_000, usd: 0.64 },
                { timestamp: 1_761_436_800_000, usd: 0.67 },
            ],
        },
    ],
    sources: [{ name: "CoinGecko", url: "https://www.coingecko.com" }],
};

describe("price chart content", () => {
    test("is read from a chat", () => {
        // As OpenChat sends it: the ledger as principal bytes and the times as u64s
        const wire = Packer.pack({
            PriceChart: {
                title: "ICP vs ADA · 2 days",
                start: 1_761_350_400_000n,
                end: 1_761_523_200_000n,
                series: [
                    {
                        token: { Ledger: Principal.fromText(ICP_LEDGER).toUint8Array() },
                        symbol: "ICP",
                        name: "Internet Computer",
                        points: [
                            [1_761_350_400_000n, 3.12],
                            [1_761_436_800_000n, 3.05],
                        ],
                    },
                    {
                        token: { Coin: "cardano" },
                        symbol: "ADA",
                        name: "Cardano",
                        points: [
                            [1_761_350_400_000n, 0.64],
                            [1_761_436_800_000n, 0.67],
                        ],
                    },
                ],
                sources: [{ name: "CoinGecko", url: "https://www.coingecko.com" }],
            },
        });

        const api = Value.Parse(ApiMessageContent, Packer.unpack(wire));

        expect(messageContent(api, SENDER)).toEqual(chart);
    });

    test("is sent as it was given", () => {
        const message = new PriceChartMessage(chart);
        const content = Value.Parse(ApiBotMessageContent, message.toResponse().content);

        expect(message.requiredMessagePermissions).toEqual(["Image"]);
        expect("PriceChart" in content).toBe(true);
        if ("PriceChart" in content) {
            expect(content.PriceChart.series[0].token).toEqual({
                Ledger: Principal.fromText(ICP_LEDGER).toUint8Array(),
            });
            expect(content.PriceChart.series[0].points[0]).toEqual([1_761_350_400_000n, 3.12]);
            expect(priceChartContent(content.PriceChart)).toEqual(chart);
        }
    });
});
