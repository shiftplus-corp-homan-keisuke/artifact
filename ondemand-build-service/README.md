# オンデマンドビルドサービス

このプロジェクトは、ユーザー提供または LLM 生成によるソースコード（主に Web フロントエンド技術）を安全な環境でオンデマンドにビルドし、その実行結果を親アプリケーション内の `<iframe>` に動的に表示するシステムです。

## 機能概要

- ソースコードを受け取り、安全な環境でビルド
- Vite を使用した最新の Web フロントエンドコードのビルド
- ビルド結果を JavaScript バンドルとして返却
- `iframe` を使用した安全な実行環境
- `postMessage` API による親アプリケーションとの通信

## システム構成

システムは以下の 3 つの主要コンポーネントから構成されています：

1. **親ウィンドウアプリケーション**: UI 提供、ビルドリクエスト発行、`iframe` 配置
2. **オンデマンドビルドサービス**: ソースコードを受け付け、Vite ビルドを実行
3. **`iframe` ローダーページ**: 親からの `postMessage` を受信し、受け取った成果物を表示

## 技術スタック

- **バックエンド**: Node.js, Express, TypeScript
- **ビルド環境**: Vite, Docker (予定)
- **通信**: postMessage API
- **ロギング**: Winston

## 開発環境のセットアップ

### 前提条件

- Node.js 16.x 以上
- npm または yarn

### インストール

```bash
# リポジトリのクローン
git clone https://github.com/yourusername/ondemand-build-service.git
cd ondemand-build-service

# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

## 使用方法

1. 開発サーバーを起動: `npm run dev`
2. ブラウザで http://localhost:3700 にアクセス
3. テキストエリアにソースコードを入力
4. 「ビルド実行」ボタンをクリック
5. ビルド結果が下部の iframe に表示されます

## API エンドポイント

### POST /api/build-artifact

ソースコードをビルドして JavaScript バンドルを返します。

**リクエスト**:

```json
{
  "sourceCode": "// ビルド対象のソースコード"
}
```

**レスポンス (成功時)**:

```json
{
  "success": true,
  "artifact": {
    "type": "jsBundle",
    "content": "// ビルドされたJavaScriptコード"
  },
  "buildInfo": {
    "duration": 1234,
    "timestamp": "2025-04-06T10:30:00Z"
  }
}
```

**レスポンス (失敗時)**:

```json
{
  "success": false,
  "error": "エラーメッセージ",
  "errorType": "BUILD_ERROR",
  "details": {
    /* エラー詳細 */
  }
}
```

## 今後の開発予定

- Docker コンテナによる安全な実行環境の実装
- 複数のフレームワーク/ライブラリのサポート
- キャッシング機能の強化
- セキュリティ対策の強化

## ライセンス

MIT
