# open-chat-bots

SDKs for building Bots for OpenChat with examples

## Overview

You can find an overview of the OpenChat Bot framework [here](./OVERVIEW.md).

## Get started

To get started by installing and testing the example bots, [see the get started guide](GETSTARTED.md).

## SDKs

This repo has SDKs for different languages:

- For bots written in Rust, [see the rs readme](./rs/README.md).
- For bots written in typescript, [see the ts readme](./ts/README.md).
- For bots written in Motoko, [see the motoko readme](./motoko/README.md) (coming soon).

---

## 補足（このフォークについて）

### プロジェクト背景
- **イベント:** OpenChat Botathon（2024年3月開催）
- **主催:** OpenChat Dev Team on ICP (Internet Computer Protocol)
- **テーマ:** AI + Blockchain の融合技術
- **元リポジトリ:** [open-chat-labs/open-chat-bots](https://github.com/open-chat-labs/open-chat-bots)
- **参加目的:** ICP 上で動作する OpenChat Bot の開発手法を学習

このプロジェクトは、分散型 SNS プラットフォーム OpenChat におけるボット開発の実践経験を提供しました。
AI と Blockchain 技術を組み合わせた先進的な取り組みへの参加実績として価値があります。

### 日本語リソース

- **Qiita記事:** [【OpenChat】ローカル環境でBot開発を始めよう！ - 環境構築からサンプルBot実行まで](https://qiita.com/ussu_ussu_ussu/items/xxxxxxxx)
- **参考動画:** [OpenChat bot framework quick start guide](https://www.youtube.com/) (YouTube)

### Docker を使った簡易環境構築

OpenChat のローカル環境は Docker を使って簡単に構築できます。

```bash
# 1. DFX (DFINITY SDK) のインストール
DFX_VERSION=0.25.1-beta.1 sh -ci "$(curl -fsSL https://sdk.dfinity.org/install.sh)"

# 2. Rust のインストール
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 3. Docker イメージの取得
docker pull --platform linux/amd64 openchatlabs/open-chat:latest

# 4. Docker コンテナの起動
docker run --platform linux/amd64 -d -p 5001:80 -p 8080:8080 --name open-chat openchatlabs/open-chat:latest
```

起動後、以下のポートで OpenChat が利用可能になります：
- **5001番ポート:** OpenChat ウェブサイト (`http://localhost:5001`)
- **8080番ポート:** 内部API (DFX が利用)

詳細な手順は [GETSTARTED.md](./GETSTARTED.md) を参照してください。
