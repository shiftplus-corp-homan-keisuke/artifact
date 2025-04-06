# Viteビルドプロセス実装とデバッグの概要

オンデマンドビルドサービスに、Dockerコンテナを利用した実際のViteビルドプロセスを実装しました。以下に実装内容とデバッグ過程の概要をまとめます。

## 1. 実装内容

### 1.1 Docker関連ファイルの作成

Viteビルドを実行するためのDocker環境を定義しました。

-   **`docker/builder/Dockerfile`**:
    -   Node.js (alpine) ベースイメージを使用。
    -   ビルドに必要なグローバルパッケージ (`vite`, `@vitejs/plugin-react`) とローカルパッケージ (`react`, `react-dom`) をインストール。
    -   ビルド実行用スクリプト (`build.sh`) をコピーし、実行権限を付与。
-   **`docker/builder/build.sh`**:
    -   コンテナ内で実行されるスクリプト。
    -   `/build` ディレクトリに移動し、`npm install` を実行して依存関係を解決。
    -   `npx vite build` を実行してビルドプロセスを開始。
    -   ビルド成果物の存在を確認。
-   **`docker/builder/package.json`**:
    -   コンテナ内でのビルドに必要な最小限の依存関係 (`react`, `react-dom`, `vite`, `@vitejs/plugin-react`) を定義。

### 1.2 コンテナサービスの作成 (`src/container/containerService.ts`)

Dockerイメージのビルドとコンテナの実行を管理するサービスクラスを作成しました。

-   `buildDockerImage()`: Dockerfileからビルドイメージ (`ondemand-build-service/builder:latest`) を作成。
-   `runBuildContainer()`:
    -   指定された一時ディレクトリをコンテナ内の `/build` にマウント。
    -   ホストユーザーと同じUID/GIDでコンテナを実行 (`-u` オプション) し、権限問題を回避。
    -   ビルドイメージを使用してコンテナを起動し、`build.sh` を実行。
    -   コンテナの標準出力・標準エラー出力をログに記録。
    -   実行結果 (成功/失敗、エラーメッセージ) を返す。

### 1.3 ビルドサービスの更新 (`src/build/buildService.ts`)

既存のビルドサービスを更新し、実際のビルドプロセスを組み込みました。

-   `mockBuild` メソッドを `realBuild` メソッドに置き換え。
-   `buildArtifact` メソッド内で以下の処理を実行:
    1.  一時ディレクトリを作成。
    2.  受け取ったソースコードと必要な設定ファイル (`package.json`, `vite.config.js`, `index.html`) を一時ディレクトリに書き込む。
    3.  `realBuild` メソッドを呼び出す。
    4.  `readArtifact` メソッドでビルド成果物 (`artifact.iife.js`) を読み取る。
    5.  結果を返す。
-   `realBuild` メソッド: `containerService.runBuildContainer()` を呼び出してDockerコンテナでのビルドを実行。
-   `readArtifact` メソッド: Viteが出力する正しいファイル名 (`artifact.iife.js`) を読み込むように修正。

### 1.4 サーバー初期化処理の追加 (`src/index.ts`)

サーバー起動前にDockerイメージがビルドされるように初期化処理を追加しました。

-   `initializeContainer()` 関数で `containerService.buildDockerImage()` を呼び出し。
-   イメージビルドが失敗した場合はプロセスを終了。

## 2. デバッグとエラー修正

実装過程で発生した主なエラーとその修正内容は以下の通りです。

1.  **`Failed to fetch` / `ERR_EMPTY_RESPONSE`**:
    -   **原因**: ビルド中に一時ディレクトリ (`tmp/`) が変更され、`nodemon` がサーバーを再起動していたため、APIリクエストが中断されていた。
    -   **修正**: `nodemon.json` を作成し、`ignore` オプションで `tmp/*` と `tmp/**/*` を指定して監視対象から除外。

2.  **Dockerコンテナ内の権限エラー (`EACCES: permission denied`)**:
    -   **原因**: コンテナ内のプロセス (デフォルトroot) が、ホストユーザー所有のマウントされたディレクトリ (`/build`) に書き込めなかった。
    -   **修正**: `containerService.runBuildContainer` 内で `docker run` に `-u ${uid}:${gid}` オプションを追加し、ホストユーザーと同じ権限でコンテナを実行するように変更。

3.  **コンテナ内でのモジュール未発見エラー (`ERR_MODULE_NOT_FOUND: Cannot find package 'vite'`)**:
    -   **原因**: `vite` がDockerfileでグローバルインストールされていたが、ビルドスクリプトの実行コンテキスト (`/build`) から `import` で見つけられなかった。
    -   **修正**: `docker/builder/build.sh` 内で `cd /build` した後に `npm install --legacy-peer-deps` を実行し、ビルドに必要な依存関係をローカルにインストールするように変更。また、`vite build` を `npx vite build` に変更。

4.  **ビルド成果物のファイル未発見エラー (`ENOENT: no such file or directory ... artifact.js`)**:
    -   **原因**: Viteの `iife` フォーマットビルドではファイル名に `.iife.js` が付与される (`artifact.iife.js`) が、`readArtifact` メソッドが `artifact.js` を読み込もうとしていた。
    -   **修正**: `readArtifact` メソッドで読み込むファイル名を `artifact.iife.js` に修正。

## 3. 結果

上記の実装と修正により、オンデマンドビルドサービスはDockerコンテナを使用して、受け取ったソースコードから安全かつ確実にViteビルドを実行し、成果物を返却できるようになりました。