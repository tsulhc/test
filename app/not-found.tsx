import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <section className="panel section explorer-empty" style={{ textAlign: 'center', padding: '100px 24px' }}>
        <span className="eyebrow">Error 404</span>
        <h1 className="section-title" style={{ fontSize: '3rem', marginTop: '20px' }}>Identity not found.</h1>
        <p className="section-subtitle" style={{ fontSize: '1.2rem', margin: '12px auto 40px', maxWidth: '500px' }}>
          The requested Pocket Intelligence page does not exist or has been relocated in the network.
        </p>
        <Link href="/" className="calculator-action" style={{ padding: '14px 32px', fontSize: '1rem' }}>
          Return to Dashboard
        </Link>
      </section>
    </main>
  );
}
