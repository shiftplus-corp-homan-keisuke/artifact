# iframe表示デバッグ計画

## 問題点

ビルド実行後、iframe内にビルドされたコンポーネントが表示されない。ブラウザコンソールにエラーメッセージは表示されていない。

## デバッグ手順

1.  **メッセージングの確認:**
    *   親ウィンドウ (`static/index.html`) と iframe (`static/loader/index.html`) の両方に `console.log` を追加し、以下のメッセージが期待通りに送受信されているかを確認する。
        *   iframe → 親: `loaderReady` メッセージ
        *   親 → iframe: `loadArtifact` メッセージ
    *   親ウィンドウ側で `iframeReady` フラグが正しく `true` に設定されているかを確認する。
2.  **ビルド成果物の確認:**
    *   親ウィンドウ (`static/index.html`) でビルドが成功した際に、サーバーから返却されるJavaScriptコード (`result.artifact.content`) の内容を `console.log` で出力し、期待通りのコードが返ってきているかを確認する。

## 処理フロー図 (Mermaid)

```mermaid
sequenceDiagram
    participant Parent as 親ウィンドウ (index.html)
    participant IFrame as iframe (loader/index.html)
    participant Server as サーバー (API)

    IFrame->>+Parent: postMessage({ type: 'loaderReady' })
    Parent->>-IFrame: (メッセージ受信、iframeReady = true)

    Note over Parent: ユーザーがビルド実行ボタンをクリック
    Parent->>+Server: POST /api/build-artifact (sourceCode)
    Server->>-Parent: レスポンス (success: true, artifact: { content: jsCode })

    alt iframeReady === true
        Parent->>+IFrame: postMessage({ type: 'loadArtifact', artifact: { content: jsCode } })
        IFrame->>-Parent: (メッセージ受信、loadArtifact(jsCode) 実行)
        Note over IFrame: スクリプト要素を作成・追加して実行
    else iframeReady === false
        Note over Parent: lastBuildArtifact に jsCode を保存
    end