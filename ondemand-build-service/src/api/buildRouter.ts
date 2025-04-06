import express, { Request, Response, NextFunction } from "express";
import { buildService } from "../build/buildService";
import { logger } from "../utils/logger";

/**
 * ビルドAPIのルーター
 * /api/build-artifact エンドポイントを提供し、ソースコードのビルドリクエストを処理する
 */
export const buildRouter = express.Router();

/**
 * POST /api/build-artifact
 * ソースコードを受け取り、ビルドサービスを使用してビルドし、結果を返す
 */
buildRouter.post(
  "/build-artifact",
  function (req: Request, res: Response, next: NextFunction) {
    (async () => {
      try {
        const { sourceCode } = req.body;

        // 入力検証
        if (!sourceCode || typeof sourceCode !== "string") {
          return res.status(400).json({
            success: false,
            error: "ソースコードが提供されていないか、無効な形式です",
            errorType: "VALIDATION_ERROR",
          });
        }

        logger.info("ビルドリクエスト受信");

        const startTime = Date.now();
        const result = await buildService.buildArtifact(sourceCode);
        const buildTime = Date.now() - startTime;

        if (!result.success) {
          return res.status(400).json({
            ...result,
            buildInfo: {
              duration: buildTime,
              timestamp: new Date().toISOString(),
            },
          });
        }

        return res.status(200).json({
          ...result,
          buildInfo: {
            duration: buildTime,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        logger.error("ビルド処理中にエラーが発生しました", error);
        return res.status(500).json({
          success: false,
          error: "内部サーバーエラー",
          errorType: "SYSTEM_ERROR",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    })().catch(next);
  }
);
