import { Link } from "../components/Link";

export function NotFoundPage() {
  return (
    <section className="stack">
      <h1>ページが見つかりません</h1>
      <p>
        <Link href="/">ホームへ戻る</Link>
      </p>
    </section>
  );
}
