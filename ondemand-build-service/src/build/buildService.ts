import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { exec } from "child_process";
import { containerService } from "../container/containerService";
import { logger } from "../utils/logger";

/**
 * ビルド結果のインターフェース
 * @interface BuildResult
 * @property {boolean} success - ビルドが成功したかどうか
 * @property {object} [artifact] - ビルド成功時の成果物
 * @property {string} artifact.type - 成果物の種類（現在はjsBundleのみ）
 * @property {string} artifact.content - 成果物の内容（JavaScriptコード文字列）
 * @property {string} [error] - ビルド失敗時のエラーメッセージ
 * @property {string} [errorType] - エラーの種類
 * @property {any} [details] - エラーの詳細情報
 */
export interface BuildResult {
  success: boolean;
  artifact?: {
    type: string;
    content: string;
  };
  error?: string;
  errorType?: string;
  details?: any;
}

/**
 * ビルドサービスクラス
 * ソースコードを受け取り、Viteを使用してビルドし、JavaScriptバンドルを返す
 */
class BuildService {
  /**
   * ソースコードをビルドして成果物を生成する
   * @param {string} sourceCode - ビルド対象のソースコード
   * @returns {Promise<BuildResult>} ビルド結果
   */
  async buildArtifact(sourceCode: string): Promise<BuildResult> {
    const buildId = uuidv4();
    const tmpDir = path.resolve(`./tmp/build-${buildId}`);

    try {
      // 1. 一時ディレクトリの作成
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });

      // 2. ソースコードの保存
      await fs.writeFile(path.join(tmpDir, "src", "main.jsx"), sourceCode);

      // 3. 必要なファイルのコピー/作成
      await this.createConfigFiles(tmpDir);

      // 4. 依存関係のインストール - コンテナ内で実行される

      // 5. ビルド実行
      await this.realBuild(tmpDir);

      // 6. 成果物の読み取り
      const artifact = await this.readArtifact(tmpDir);

      return {
        success: true,
        artifact: {
          type: "jsBundle",
          content: artifact,
        },
      };
    } catch (error) {
      logger.error("ビルド中にエラーが発生しました:", error);

      let errorMessage = "成果物のビルドに失敗しました";
      let errorType = "BUILD_ERROR";
      let details = error instanceof Error ? error.message : String(error);

      // エラーメッセージからViteのビルドエラーを抽出
      if (details.includes("vite")) {
        errorMessage = "Viteビルドエラー";
        // エラーログからより詳細な情報を抽出
        const errorLines = details
          .split("\n")
          .filter((line) => line.includes("ERROR") || line.includes("Error"));
        if (errorLines.length > 0) {
          details = errorLines.join("\n");
        }
      }

      return {
        success: false,
        error: errorMessage,
        errorType: errorType,
        details: details,
      };
    } finally {
      // 一時ディレクトリの削除 (非同期で実行)
      fs.rm(tmpDir, { recursive: true, force: true }).catch((err) =>
        logger.error("一時ディレクトリの削除に失敗しました", err)
      );
    }
  }

  /**
   * ビルドに必要な設定ファイルを作成する
   * @param {string} buildDir - ビルドディレクトリのパス
   * @returns {Promise<void>}
   * @private
   */
  private async createConfigFiles(buildDir: string): Promise<void> {
    // package.json
    const packageJson = {
      name: "artifact-build",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        build: "vite build",
      },
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0",
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.0.0",
        vite: "^4.3.9", // Note: Ensure this matches Dockerfile/build.sh if changed
      },
    };

    // vite.config.js
    const viteConfig = `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // ブラウザ環境で process.env を使用できるようにする
    'process.env': JSON.stringify({
      NODE_ENV: 'production',
    })
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: true,
    lib: {
      entry: 'src/main.jsx',
      formats: ['iife'],
      name: 'ArtifactApp',
      fileName: 'artifact' // Vite adds .iife.js automatically
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    }
  }
});
    `;

    // index.html (for context, not strictly needed for lib build)
    const indexHtml = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Artifact Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
    `;

    await fs.writeFile(
      path.join(buildDir, "package.json"),
      JSON.stringify(packageJson, null, 2)
    );
    await fs.writeFile(path.join(buildDir, "vite.config.js"), viteConfig);
    await fs.writeFile(path.join(buildDir, "index.html"), indexHtml);
  }

  /**
   * 実際のViteビルドを実行する（Dockerコンテナで実行）
   * @param {string} buildDir - ビルドディレクトリのパス
   * @returns {Promise<void>}
   * @private
   */
  private async realBuild(buildDir: string): Promise<void> {
    // 出力ディレクトリの作成 (コンテナ内で作成されるので不要かも？要確認)
    // const outputDir = path.join(buildDir, "dist");
    // await fs.mkdir(outputDir, { recursive: true });

    // Dockerコンテナでビルドを実行
    logger.info(`Dockerコンテナでビルドを実行: ${buildDir}`);

    // Dockerコンテナでビルドを実行
    const result = await containerService.runBuildContainer(buildDir);

    if (!result.success) {
      // エラー内容を詳細にログ出力
      logger.error(`ビルド実行エラー詳細: ${result.error}`);
      // エラーを再スローして buildArtifact の catch ブロックで処理
      throw new Error(`ビルド実行エラー: ${result.error}`);
    }

    // ビルド成功ログ
    logger.info("Dockerコンテナでのビルドが正常に完了しました");
  }

  /**
   * ビルド成果物を読み取る
   * @param {string} buildDir - ビルドディレクトリのパス
   * @returns {Promise<string>} 成果物の内容
   * @private
   */
  private async readArtifact(buildDir: string): Promise<string> {
    // Viteのiifeフォーマットビルドでは .iife.js が付与されるため、正しいファイル名を指定
    const artifactPath = path.join(buildDir, "dist", "artifact.iife.js");
    logger.info(`成果物ファイルを読み込み: ${artifactPath}`);
    try {
      return await fs.readFile(artifactPath, "utf-8");
    } catch (readError) {
      logger.error(
        `成果物ファイルの読み込みエラー: ${artifactPath}`,
        readError
      );
      throw new Error(
        `成果物ファイルの読み込みに失敗しました: ${artifactPath}`
      );
    }
  }
}

// シングルトンインスタンスをエクスポート
export const buildService = new BuildService();
