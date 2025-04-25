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
const PORT = process.env.PORT || 3700;

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
    const server = app.listen(PORT, () => {
      // server 変数に格納
      logger.info(`サーバーリスニング開始: http://localhost:${PORT}`); // ログ変更
      logger.info("Docker環境を使用してViteビルドを実行します");
    });

    // listen イベントの確認
    server.on("listening", () => {
      logger.info("サーバーが listening イベントを発火しました。");
    });

    // エラーハンドリングを追加
    server.on("error", (error) => {
      logger.error("サーバーリスニング中にエラーが発生しました:", error);
      process.exit(1);
    });

    // プロセス終了時のログ
    process.on("exit", (code) => {
      logger.info(`プロセスがコード ${code} で終了します。`);
    });
    // SIGINT シグナルハンドリングを追加
    process.on("SIGINT", () => {
      logger.info("SIGINT を受信しました。サーバーをシャットダウンします...");
      server.close(() => {
        logger.info("サーバーが正常にクローズされました。");
        process.exit(0);
      });
    });
  })
  .catch((err) => {
    logger.error("初期化中にエラーが発生しました:", err);
  });

export default app;
