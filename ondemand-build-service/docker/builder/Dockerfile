FROM node:20-alpine

# 非rootユーザーの作成
RUN addgroup -S builduser && adduser -S builduser -G builduser

# 必要なパッケージのインストール
WORKDIR /app
COPY package.json ./
RUN npm install -g vite@4.3.9 @vitejs/plugin-react@4.0.0
RUN npm install react@18.2.0 react-dom@18.2.0

# ビルドスクリプトの追加
COPY build.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/build.sh

# 非rootユーザーに切り替え
USER builduser
WORKDIR /build

ENTRYPOINT ["/usr/local/bin/build.sh"]