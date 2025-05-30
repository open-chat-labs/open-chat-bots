import { Response } from "express";
import { WithBotClient } from "../types";
import { success } from "./success";
import * as cheerio from "cheerio";

const MAX_ARTICLES = 10;

type NewsSummary = {
  title: string;
  link: string;
};

async function scrapeBBCNews(): Promise<NewsSummary[]> {
  const url = "https://www.bbc.co.uk/news";

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Unable to load the bbc website");
    }

    const data = await response.text();
    const $ = cheerio.load(data);
    const newsSummaries: { title: string; link: string }[] = [];

    $("h3")
      .slice(0, MAX_ARTICLES)
      .each((i, element) => {
        const title = $(element).text();
        const link = $(element).find("a").attr("href");
        if (link && !link.startsWith("http")) {
          newsSummaries.push({
            title,
            link: `https://www.bbc.co.uk${link}`,
          });
        } else if (link) {
          newsSummaries.push({ title, link });
        }
      });

    return newsSummaries;
  } catch (error) {
    console.error("Failed to retrieve news:", error);
    return [];
  }
}

function toMarkdown(news: NewsSummary[]): string {
  return news.map(({ title, link }) => `* [${title}](${link})`).join("\n");
}

export default async function news(req: WithBotClient, res: Response) {
  const client = req.botClient;
  const news = await scrapeBBCNews();
  const msg = (
    await client.createTextMessage(toMarkdown(news))
  ).setBlockLevelMarkdown(true);

  res.status(200).json(success(msg));
  client
    .sendMessage(msg)
    .catch((err: unknown) => console.error("sendMessage failed with: ", err));
}
