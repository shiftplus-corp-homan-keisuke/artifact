# オンデマンドビルドサービス モックアップ実装手順書

## 概要

この手順書では、オンデマンドビルドサービスの簡易版（モックアップ）をローカル環境で実装するための手順を説明します。モックアップでは、主要機能を簡略化して実装し、基本的なフローの検証を行います。

## 前提条件

- Node.js 20.x 以上の長期安定版
- Docker Desktop
- Git
- 基本的なターミナル/コマンドライン操作の知識

## 1. プロジェクト準備

### 1.1 ディレクトリ構造の作成

```bash
# プロジェクトディレクトリを作成
mkdir -p ondemand-build-service/src
cd ondemand-build-service

# サブディレクトリを作成
mkdir -p src/api
mkdir -p src/build
mkdir -p src/container
mkdir -p src/utils
mkdir -p test/samples
mkdir -p docker/builder

# 静的ファイル用のディレクトリ
mkdir -p static/loader
```

### 1.2 プロジェクト初期化

```bash
# package.json の作成
npm init -y

# .gitignore の作成
cat > .gitignore << EOL
node_modules/
dist/
.env
*.log
.DS_Store
tmp/
EOL

# .env ファイルの作成
cat > .env << EOL
PORT=3033
NODE_ENV=development
CONTAINER_TIMEOUT=60
EOL
```

## 2. 依存関係のインストール

```bash
# コアパッケージのインストール
npm install express body-parser cors dotenv winston

# 開発用パッケージのインストール
npm install --save-dev nodemon typescript ts-node @types/node @types/express jest supertest
```

## 3. TypeScript 設定

```bash
# tsconfig.json の作成
cat > tsconfig.json << EOL
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "**/*.test.ts"]
}
EOL
```

## 4. サーバーアプリケーションの実装

### 4.1 メインアプリケーションファイル (src/index.ts)

```typescript
// src/index.ts
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { buildRouter } from "./api/buildRouter";
import { logger } from "./utils/logger";

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

// サーバーの起動
app.listen(PORT, () => {
  logger.info(`サーバーが起動しました: http://localhost:${PORT}`);
});

export default app;
```

### 4.2 API ルーター (src/api/buildRouter.ts)

```typescript
// src/api/buildRouter.ts
import express from "express";
import { buildService } from "../build/buildService";
import { logger } from "../utils/logger";

export const buildRouter = express.Router();

buildRouter.post("/build-artifact", async (req, res) => {
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
});
```

### 4.3 ビルドサービス (src/build/buildService.ts)

```typescript
// src/build/buildService.ts
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";

const execFileAsync = promisify(execFile);

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

class BuildService {
  // モックアップ版ではコンテナを使わずにローカルで直接ビルド
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

      // 4. 依存関係のインストール - モックアップではスキップ

      // 5. ビルド実行 - モックアップでは簡易的に実行
      // 本実装では実際に vite build を実行
      await this.mockBuild(tmpDir);

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
      logger.error("ビルド中にエラーが発生しました", error);
      return {
        success: false,
        error: "成果物のビルドに失敗しました",
        errorType: "BUILD_ERROR",
        details: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // 一時ディレクトリの削除 (非同期で実行)
      fs.rm(tmpDir, { recursive: true, force: true }).catch((err) =>
        logger.error("一時ディレクトリの削除に失敗しました", err)
      );
    }
  }

  private async createConfigFiles(buildDir: string): Promise<void> {
    // package.json
    const packageJson = {
      name: "artifact-build",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        build: "echo 'モックビルド'",
      },
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0",
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.0.0",
        vite: "^4.3.9",
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
      fileName: 'artifact'
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

    // index.html
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

  private async mockBuild(buildDir: string): Promise<void> {
    // モックアップ版ではViteビルドを実際に実行せず、代わりにモックの成果物を生成
    const mockOutputDir = path.join(buildDir, "dist");
    await fs.mkdir(mockOutputDir, { recursive: true });

    // モックJSバンドルを生成
    const sourceCode = await fs.readFile(
      path.join(buildDir, "src", "main.jsx"),
      "utf-8"
    );
    const mockBundle = `
/* モックビルド成果物 */
(function() {
  window.ArtifactApp = {};
  
  // ここに実際のビルド結果が入ります
  const sourceCode = ${JSON.stringify(sourceCode)};
  
  // モック実行 - document.bodyに内容を追加
  document.addEventListener('DOMContentLoaded', function() {
    const rootEl = document.getElementById('root');
    if (rootEl) {
      rootEl.innerHTML = '<div class="mock-artifact"><h2>モックビルド成果物</h2><pre>' + 
        sourceCode.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre></div>';
    }
  });
})();
    `;

    await fs.writeFile(path.join(mockOutputDir, "artifact.js"), mockBundle);
  }

  private async readArtifact(buildDir: string): Promise<string> {
    return fs.readFile(path.join(buildDir, "dist", "artifact.js"), "utf-8");
  }
}

export const buildService = new BuildService();
```

### 4.4 ロガー (src/utils/logger.ts)

```typescript
// src/utils/logger.ts
import winston from "winston";

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...rest }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${
        Object.keys(rest).length ? JSON.stringify(rest) : ""
      }`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "app.log" }),
  ],
});
```

## 5. iframe ローダーページの実装

### 5.1 ローダーページ HTML (static/loader/index.html)

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Artifact Loader</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background-color: #f5f5f5;
      }
      #artifact-root {
        width: 100%;
        max-width: 800px;
        min-height: 400px;
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        padding: 20px;
        box-sizing: border-box;
      }
      .loader {
        text-align: center;
        padding: 20px;
      }
      .error {
        color: #721c24;
        background-color: #f8d7da;
        border: 1px solid #f5c6cb;
        padding: 10px;
        border-radius: 4px;
        margin-bottom: 15px;
      }
    </style>
  </head>
  <body>
    <div id="artifact-root">
      <div class="loader">ローダーの準備中...</div>
    </div>

    <script>
      (function () {
        // 親オリジンの設定 - 本番では正確に設定する必要あり
        const ALLOWED_PARENT_ORIGIN = "*"; // モックアップ用に全て許可
        let currentCleanup = null;

        function handleMessage(event) {
          // オリジンチェック - モックでは緩めに設定
          // if (event.origin !== ALLOWED_PARENT_ORIGIN) return;

          const { data } = event;

          if (data.type === "loadArtifact") {
            loadArtifact(data.artifact);
          }
        }

        function loadArtifact(artifact) {
          cleanupPreviousArtifact();

          if (!artifact || !artifact.type) {
            displayError("無効なアーティファクトデータ");
            return;
          }

          try {
            if (artifact.type === "jsBundle") {
              const scriptElement = document.createElement("script");
              scriptElement.textContent = artifact.content;
              document.head.appendChild(scriptElement);

              currentCleanup = () => {
                document.head.removeChild(scriptElement);
              };
            } else {
              displayError(
                `未サポートのアーティファクト種別: ${artifact.type}`
              );
            }
          } catch (error) {
            displayError(
              `アーティファクトの実行中にエラーが発生しました: ${error.message}`
            );
          }
        }

        function cleanupPreviousArtifact() {
          const artifactRoot = document.getElementById("artifact-root");

          // 前回のクリーンアップ関数を実行
          if (typeof currentCleanup === "function") {
            try {
              currentCleanup();
            } catch (err) {
              console.error("クリーンアップ中にエラーが発生しました", err);
            }
            currentCleanup = null;
          }

          // artifact-rootをクリア
          artifactRoot.innerHTML = "";
        }

        function displayError(message) {
          const artifactRoot = document.getElementById("artifact-root");
          const errorElement = document.createElement("div");
          errorElement.className = "error";
          errorElement.textContent = message;
          artifactRoot.appendChild(errorElement);
        }

        // メッセージリスナーの登録
        window.addEventListener("message", handleMessage);

        // 初期化完了を親ウィンドウに通知
        window.parent.postMessage({ type: "loaderReady" }, "*");

        // artifact-rootを準備完了状態に更新
        document.getElementById("artifact-root").innerHTML =
          '<div class="loader">アーティファクト待機中...</div>';
      })();
    </script>
  </body>
</html>
```

## 6. デモページの作成 (static/index.html)

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>オンデマンドビルドサービス デモ</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 20px;
        background-color: #f7f7f7;
      }
      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      }
      h1 {
        text-align: center;
        color: #333;
      }
      .code-editor {
        display: flex;
        flex-direction: column;
        margin-bottom: 20px;
      }
      textarea {
        width: 100%;
        height: 300px;
        padding: 10px;
        font-family: monospace;
        border: 1px solid #ddd;
        border-radius: 4px;
        resize: vertical;
        margin-bottom: 10px;
      }
      .buttons {
        display: flex;
        gap: 10px;
      }
      button {
        padding: 10px 20px;
        background-color: #4caf50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
      }
      button:hover {
        background-color: #45a049;
      }
      button:disabled {
        background-color: #cccccc;
        cursor: not-allowed;
      }
      .status {
        margin: 10px 0;
        padding: 10px;
        border-radius: 4px;
        background-color: #f8f9fa;
      }
      .status.error {
        background-color: #f8d7da;
        color: #721c24;
      }
      .status.success {
        background-color: #d4edda;
        color: #155724;
      }
      .iframe-container {
        width: 100%;
        height: 400px;
        border: 1px solid #ddd;
        border-radius: 4px;
        overflow: hidden;
      }
      iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>オンデマンドビルドサービス デモ</h1>

      <div class="code-editor">
        <h2>ソースコード</h2>
        <textarea id="source-code">
// React サンプルコンポーネント
import React, { useState } from 'react';
import ReactDOM from 'react-dom';

function App() {
  const [count, setCount] = useState(0);
  
  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <h1>Reactカウンターアプリ</h1>
      <p>現在のカウント: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        増加
      </button>
      <button onClick={() => setCount(count - 1)}>
        減少
      </button>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));</textarea
        >

        <div class="buttons">
          <button id="build-button">ビルド実行</button>
          <button id="reset-button">リセット</button>
        </div>
      </div>

      <div id="status" class="status">準備完了</div>

      <h2>プレビュー</h2>
      <div class="iframe-container">
        <iframe
          id="preview-iframe"
          src="/loader/index.html"
          sandbox="allow-scripts"
        ></iframe>
      </div>
    </div>

    <script>
      document.addEventListener("DOMContentLoaded", function () {
        const sourceCodeTextarea = document.getElementById("source-code");
        const buildButton = document.getElementById("build-button");
        const resetButton = document.getElementById("reset-button");
        const statusElement = document.getElementById("status");
        const previewIframe = document.getElementById("preview-iframe");

        let iframeReady = false;
        let lastBuildArtifact = null;

        // iframe ローダーからのメッセージ処理
        window.addEventListener("message", function (event) {
          // オリジンチェックは本番環境では必須
          // if (event.origin !== 'http://localhost:3000') return;

          const { data } = event;

          if (data.type === "loaderReady") {
            iframeReady = true;
            updateStatus("iframe ローダーの準備完了");

            // 既にビルド済みのアーティファクトがある場合は送信
            if (lastBuildArtifact) {
              sendArtifactToIframe(lastBuildArtifact);
            }
          }
        });

        // ビルドボタンのクリックハンドラ
        buildButton.addEventListener("click", async function () {
          const sourceCode = sourceCodeTextarea.value;

          if (!sourceCode.trim()) {
            updateStatus("ソースコードが空です", "error");
            return;
          }

          buildButton.disabled = true;
          updateStatus("ビルド中...", "info");

          try {
            const response = await fetch("/api/build-artifact", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ sourceCode }),
            });

            const result = await response.json();

            if (!result.success) {
              updateStatus(`ビルドエラー: ${result.error}`, "error");
              console.error("ビルドエラー詳細:", result);
              return;
            }

            updateStatus(
              `ビルド成功 (${result.buildInfo.duration}ms)`,
              "success"
            );
            lastBuildArtifact = result.artifact;

            if (iframeReady) {
              sendArtifactToIframe(result.artifact);
            }
          } catch (error) {
            updateStatus(`エラー: ${error.message}`, "error");
            console.error("ビルドリクエスト失敗:", error);
          } finally {
            buildButton.disabled = false;
          }
        });

        // リセットボタンのクリックハンドラ
        resetButton.addEventListener("click", function () {
          // iframe のリロード
          previewIframe.src = previewIframe.src;
          iframeReady = false;
          lastBuildArtifact = null;
          updateStatus("リセットしました");
        });

        // ステータス表示の更新
        function updateStatus(message, type = "") {
          statusElement.textContent = message;
          statusElement.className = "status";

          if (type) {
            statusElement.classList.add(type);
          }
        }

        // アーティファクトを iframe に送信
        function sendArtifactToIframe(artifact) {
          const iframeWindow = previewIframe.contentWindow;

          if (iframeWindow) {
            iframeWindow.postMessage(
              {
                type: "loadArtifact",
                artifact: artifact,
              },
              "*"
            );
          }
        }
      });
    </script>
  </body>
</html>
```

## 7. パッケージスクリプトの設定

package.json に以下のスクリプトを追加します：

```json
{
  "scripts": {
    "start": "ts-node src/index.ts",
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "serve": "node dist/index.js"
  }
}
```

## 8. 起動と動作確認

1. 開発モードで起動：

```bash
npm run dev
```

2. ブラウザで http://localhost:3000 にアクセスしてデモページを表示

3. サンプルコードを編集またはそのままで「ビルド実行」ボタンをクリック

4. プレビュー iframe にビルド結果が表示されることを確認

## 9. Docker 対応（オプション）

Dockerfile を作成してコンテナ化する場合：

```bash
# Dockerfileの作成
cat > Dockerfile << EOL
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "serve"]
EOL

# .dockerignoreの作成
cat > .dockerignore << EOL
node_modules
npm-debug.log
dist
.git
.env
tmp
EOL
```

Docker でのビルドと実行：

```bash
docker build -t ondemand-build-service .
docker run -p 3000:3000 ondemand-build-service
```

## 次のステップ

このモックアップ実装が完了したら、以下の拡張が考えられます：

1. 実際の Vite ビルドプロセスの実装
2. Docker コンテナ内でのビルド実行
3. エラーハンドリングの強化
4. ユニットテストと E2E テストの追加
5. 本番環境用の設定と最適化

---

この手順書に従ってローカル環境に簡易的なモックアップを実装することで、オンデマンドビルドサービスの基本的な機能と動作フローを確認できます。実際の本番実装では、セキュリティ対策やコンテナ隔離、パフォーマンス最適化などをさらに強化する必要があります。
