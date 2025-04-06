import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { buildRouter } from "./api/buildRouter";
import { logger } from "./utils/logger";
import { containerService } from "./container/containerService";

// 環境変数のロード
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェアの設定
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "../static")));

// ルーターの設定
app.use("/api", buildRouter);

// 基本的なルート
app.get("/", (req, res) => {
  res.send("オンデマンドビルドサービス API サーバー");
});

// サーバー起動前にDockerイメージをビルド
async function initializeContainer() {
  logger.info("Dockerイメージのビルドを開始します...");
  const result = await containerService.buildDockerImage();
  if (result.success) {
    logger.info("Dockerイメージのビルドが完了しました");
  } else {
    logger.error(`Dockerイメージのビルドに失敗しました: ${result.error}`);
    process.exit(1);
  }
}

// サーバー起動前に初期化を実行
initializeContainer()
  .then(() => {
    // サーバーの起動
    app.listen(PORT, () => {
      logger.info(`サーバーが起動しました: http://localhost:${PORT}`);
      logger.info("Docker環境を使用してViteビルドを実行します");
    });
  })
  .catch((err) => {
    logger.error("初期化中にエラーが発生しました:", err);
  });

export default app;
