#!/bin/sh
set -e

# ビルドプロセスを実行
echo "Viteビルドを開始します..."
cd /build
# package.json が存在することを確認
if [ ! -f "package.json" ]; then
  echo "エラー: package.jsonが見つかりません"
  exit 1
fi
# 依存関係のインストール
echo "依存関係をインストール中..."
npm install --legacy-peer-deps # --legacy-peer-deps は依存関係の競合を緩和するため

# ビルドの実行
echo "Viteビルドを実行中..."
npx vite build
echo "ビルド完了"