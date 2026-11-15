import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { FatalScreen } from "./FatalScreen";
import "./styles.css";

const root = createRoot(document.getElementById("root")!, {
  // エラー境界に捕まらなかった例外。呼ばれた時点で React はツリー全体を外している（react-dom 19.2）
  // ので、代わりに再読み込みの画面を描く。既定のハンドラを置き換えるぶん、console と window の
  // error イベントへは reportError で流す
  onUncaughtError(error) {
    reportError(error);
    root.render(<FatalScreen />);
  },
});

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
