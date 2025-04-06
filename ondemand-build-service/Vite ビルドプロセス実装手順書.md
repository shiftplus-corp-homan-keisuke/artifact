# Vite ビルドプロセス実装手順書

このドキュメントでは、オンデマンドビルドサービスにおける実際の Vite ビルドプロセスの実装手順について説明します。

## 1. 概要

オンデマンドビルドサービスでは、ユーザーから送信された React コンポーネントのソースコードを受け取り、Vite を使用してビルドし、JavaScript バンドルを返します。このプロセスは Docker コンテナ内で実行され、安全かつ効率的なビルド環境を提供します。

## 2. 実装手順

### 2.1 Docker コンテナ関連ファイルの作成

#### 2.1.1 Dockerfile

`docker/builder/Dockerfile`を作成し、以下の内容を記述します：

```dockerfile
FROM node:20-alpine

# ビルド用ユーザーの作成 (コンテナ内での権限管理用だが、現在は未使用)
# RUN addgroup -S builduser && adduser -S builduser -G builduser

# アプリケーションディレクトリの設定
WORKDIR /app

# 依存関係のインストール (注意: build.sh内でローカルインストールするため、最適化可能)
COPY package.json ./
RUN npm install -g vite@4.3.9 @vitejs/plugin-react@4.0.0
RUN npm install react@18.2.0 react-dom@18.2.0

# ビルドスクリプトのコピーと実行権限の付与
COPY build.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/build.sh

# ビルドディレクトリの設定
WORKDIR /build

# コンテナ起動時にビルドスクリプトを実行
ENTRYPOINT ["build.sh"]
```

_注意: Dockerfile 内の`npm install`は、`build.sh`でのローカルインストールにより冗長になっている可能性があります。将来的な最適化として削除を検討できます。_

#### 2.1.2 ビルドスクリプト

`docker/builder/build.sh`を作成し、以下の内容を記述します：

```bash
#!/bin/sh
set -e

echo "Viteビルドを開始します..."

# ビルドディレクトリの確認
if [ ! -d "/build" ]; then
  echo "エラー: /buildディレクトリが見つかりません"
  exit 1
fi

# ソースコードの確認
if [ ! -f "/build/src/main.jsx" ]; then
  echo "エラー: ソースコードファイル(/build/src/main.jsx)が見つかりません"
  exit 1
fi

# 設定ファイルの確認
if [ ! -f "/build/vite.config.js" ]; then
  echo "エラー: Vite設定ファイル(/build/vite.config.js)が見つかりません"
  exit 1
fi

# 依存関係のインストール
echo "依存関係をインストール中..."
cd /build
# package.json が存在することを確認
if [ ! -f "package.json" ]; then
  echo "エラー: package.jsonが見つかりません"
  exit 1
fi
npm install --legacy-peer-deps # --legacy-peer-deps は依存関係の競合を緩和するため

# ビルドの実行
echo "Viteビルドを実行中..."
npx vite build

# ビルド結果の確認 (正しいファイル名を確認)
if [ ! -f "/build/dist/artifact.iife.js" ]; then
  echo "エラー: ビルド成果物(/build/dist/artifact.iife.js)が生成されませんでした"
  exit 1
fi

echo "Viteビルドが正常に完了しました"
exit 0
```

#### 2.1.3 package.json

`docker/builder/package.json`を作成し、以下の内容を記述します：

```json
{
  "name": "vite-builder",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.3.9"
  }
}
```

### 2.2 コンテナサービスの実装

`src/container/containerService.ts`を作成し、以下の内容を記述します：

```typescript
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
          logger.debug(`コンテナ出力(stderr): ${chunk}`);
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
```

### 2.3 ビルドサービスの更新

`src/build/buildService.ts`を更新し、`mockBuild`メソッドを`realBuild`メソッドに置き換えます：

```typescript
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
```

### 2.4 サーバー初期化コードの追加

`src/index.ts`を更新し、サーバー起動前に Docker イメージをビルドするための初期化コードを追加します：

```typescript
// サーバー起動前にDockerイメージをビルド
async function initializeContainer() {
  logger.info("Dockerイメージのビルドを開始します...");
  const result = await containerService.buildDockerImage();
  if (result.success) {
    logger.info("Dockerイメージのビルドが完了しました");
  } else {
    logger.error(`Dockerイメージのビルドに失敗しました: ${result.error}`);
    process.exit(1); // ビルド失敗時はサーバーを起動しない
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
    process.exit(1); // 初期化失敗時もサーバーを起動しない
  });
```

## 3. 動作確認

### 3.1 サーバーの起動

```bash
npm run dev
```

サーバー起動時に、Docker イメージのビルドが実行されます。ビルドが成功すると、サーバーが起動します。

### 3.2 ビルドリクエストの送信

以下のようなリクエストを送信して、ビルドプロセスをテストします：

```bash
curl -X POST http://localhost:3000/api/build-artifact \
  -H "Content-Type: application/json" \
  -d '{"sourceCode": "import React from \"react\"; export default function App() { return <div>Hello World</div>; }"}'
```

### 3.3 ビルド結果の確認

レスポンスとして、ビルドされた JavaScript バンドルが返されます。

## 4. トラブルシューティング

### 4.1 Docker が見つからない場合

Docker がインストールされていない場合は、以下のエラーが発生します：

```
The command 'docker' could not be found
```

この場合は、Docker をインストールするか、ローカル環境で Vite ビルドを実行するように実装を変更する必要があります。

### 4.2 一般的なビルドエラー

ビルド中にエラーが発生した場合は、サーバーのログを確認して原因を特定します。一般的なエラーとしては以下のようなものがあります：

- ソースコードの構文エラー
- 依存関係の問題 (`npm install` の失敗など)
- ビルド設定 (`vite.config.js`) の問題

### 4.3 実装中に発生した主なエラーと修正

実装過程で発生した主なエラーとその修正内容は以下の通りです。

1.  **`Failed to fetch` / `ERR_EMPTY_RESPONSE` (フロントエンド)**:

    - **原因**: ビルド中に一時ディレクトリ (`tmp/`) が変更され、`nodemon` がサーバーを再起動していたため、API リクエストが中断されていた。
    - **修正**: `nodemon.json` を作成し、`ignore` オプションで `tmp/*` と `tmp/**/*` を指定して監視対象から除外。

2.  **Docker コンテナ内の権限エラー (`EACCES: permission denied`)**:

    - **原因**: コンテナ内のプロセス (デフォルト root) が、ホストユーザー所有のマウントされたディレクトリ (`/build`) に書き込めなかった。
    - **修正**: `containerService.runBuildContainer` 内で `docker run` に `-u ${uid}:${gid}` オプションを追加し、ホストユーザーと同じ権限でコンテナを実行するように変更。

3.  **コンテナ内でのモジュール未発見エラー (`ERR_MODULE_NOT_FOUND: Cannot find package 'vite'`)**:

    - **原因**: `vite` が Dockerfile でグローバルインストールされていたが、ビルドスクリプトの実行コンテキスト (`/build`) から `import` で見つけられなかった。
    - **修正**: `docker/builder/build.sh` 内で `cd /build` した後に `npm install --legacy-peer-deps` を実行し、ビルドに必要な依存関係をローカルにインストールするように変更。また、`vite build` を `npx vite build` に変更。

4.  **ビルド成果物のファイル未発見エラー (`ENOENT: no such file or directory ... artifact.js`)**:
    - **原因**: Vite の `iife` フォーマットビルドではファイル名に `.iife.js` が付与される (`artifact.iife.js`) が、`readArtifact` メソッドが `artifact.js` を読み込もうとしていた。
    - **修正**: `readArtifact` メソッドで読み込むファイル名を `artifact.iife.js` に修正。

## 5. 注意点

- Docker コンテナ内でビルドを実行するため、ホストマシンに Docker がインストールされている必要があります。
- ビルドプロセスは一時ディレクトリで実行され、ビルド完了後に自動的に削除されます。
- セキュリティ上の理由から、コンテナ内ではホストユーザーと同じ権限で実行されます（`docker run -u` オプション）。
