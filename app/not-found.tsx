import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <section className="panel section explorer-empty">
        <span className="eyebrow">404</span>
        <h1 className="section-title">Page not found.</h1>
        <p className="section-subtitle">The requested Pocket provider dashboard page does not exist.</p>
        <Link href="/" className="calculator-action provider-back-link">
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
