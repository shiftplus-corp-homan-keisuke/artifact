import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { logger } from "../utils/logger";

/**
 * コンテナ操作の結果インターフェース
 * @interface ContainerResult
 * @property {boolean} success - 操作が成功したかどうか
 * @property {string} [output] - 成功時の出力
 * @property {string} [error] - 失敗時のエラーメッセージ
 */
export interface ContainerResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Dockerコンテナを操作するためのサービスクラス
 * ビルドコンテナの実行とDockerイメージのビルドを担当
 */
export class ContainerService {
  /**
   * Dockerコンテナ内でViteビルドを実行する
   * @param buildDir ビルドディレクトリのパス
   * @returns ビルド結果
   */
  async runBuildContainer(buildDir: string): Promise<ContainerResult> {
    try {
      // Dockerコンテナを実行するコマンド
      const dockerCommand = "docker";
      // ホストのUIDとGIDを取得
      const uid = process.getuid ? process.getuid() : 1000; // process.getuid() がない環境のためのフォールバック
      const gid = process.getgid ? process.getgid() : 1000; // process.getgid() がない環境のためのフォールバック

      const args = [
        "run",
        "--rm",
        // ホストのUID/GIDでコンテナを実行
        "-u",
        `${uid}:${gid}`,
        // ボリュームマウント
        "-v",
        `${buildDir}:/build`,
        // 使用するイメージ
        "ondemand-build-service/builder:latest",
      ];

      logger.info(`Dockerコンテナを起動: ${dockerCommand} ${args.join(" ")}`);

      return new Promise<ContainerResult>((resolve, reject) => {
        const process = spawn(dockerCommand, args);

        let stdout = "";
        let stderr = "";

        process.stdout.on("data", (data) => {
          const chunk = data.toString();
          stdout += chunk;
          logger.debug(`コンテナ出力: ${chunk}`);
        });

        process.stderr.on("data", (data) => {
          const chunk = data.toString();
          stderr += chunk;
          logger.debug(`コンテナエラー: ${chunk}`);
        });

        process.on("close", (code) => {
          if (code === 0) {
            resolve({
              success: true,
              output: stdout,
            });
          } else {
            logger.error(`コンテナ実行エラー (コード: ${code}): ${stderr}`);
            resolve({
              success: false,
              error: stderr || `コンテナ実行エラー (コード: ${code})`,
            });
          }
        });

        process.on("error", (err) => {
          logger.error("コンテナ起動エラー:", err);
          reject({
            success: false,
            error: `コンテナ起動エラー: ${err.message}`,
          });
        });
      });
    } catch (error) {
      logger.error("コンテナサービスエラー:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Dockerイメージをビルドする
   * @returns ビルド結果
   */
  async buildDockerImage(): Promise<ContainerResult> {
    try {
      const dockerfilePath = path.resolve("./docker/builder");

      // Dockerイメージをビルドするコマンド
      const dockerCommand = "docker";
      const args = [
        "build",
        "-t",
        "ondemand-build-service/builder:latest",
        dockerfilePath,
      ];

      logger.info(`Dockerイメージをビルド: ${dockerCommand} ${args.join(" ")}`);

      return new Promise<ContainerResult>((resolve, reject) => {
        const process = spawn(dockerCommand, args);

        let stdout = "";
        let stderr = "";

        process.stdout.on("data", (data) => {
          stdout += data.toString();
          logger.debug(`Dockerビルド出力: ${data.toString()}`);
        });

        process.stderr.on("data", (data) => {
          stderr += data.toString();
          logger.debug(`Dockerビルド出力(stderr): ${data.toString()}`);
        });

        process.on("close", (code) => {
          if (code === 0) {
            resolve({
              success: true,
              output: stdout,
            });
          } else {
            logger.error(
              `Dockerイメージビルドエラー (コード: ${code}): ${stderr}`
            );
            resolve({
              success: false,
              error: stderr || `Dockerイメージビルドエラー (コード: ${code})`,
            });
          }
        });

        process.on("error", (err) => {
          logger.error("Dockerイメージビルド起動エラー:", err);
          reject({
            success: false,
            error: `Dockerイメージビルド起動エラー: ${err.message}`,
          });
        });
      });
    } catch (error) {
      logger.error("Dockerイメージビルドエラー:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// シングルトンインスタンスをエクスポート
export const containerService = new ContainerService();
