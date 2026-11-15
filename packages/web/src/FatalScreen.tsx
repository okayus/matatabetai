// React が外したツリーの代わりに、main.tsx の onUncaughtError が描く画面。アプリの中へ戻る手段は
// もう無いので、出すのは再読み込みだけ。state も fetch も props も持たず、投げない: ここが投げると
// onUncaughtError に戻り、同じ描画を繰り返す
export function FatalScreen() {
  return (
    <main className="container">
      <section className="stack hero">
        <div className="stack" role="alert">
          <h1>表示できませんでした</h1>
          <p>再読み込みすると直ることがあります。</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => location.reload()}>
          再読み込み
        </button>
      </section>
    </main>
  );
}
