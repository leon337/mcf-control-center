import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing">
      <p className="eyebrow">MCF CONTROL CENTER</p>
      <h1>Operational cockpit foundation</h1>
      <p>E4 baseline shell. Live integrations remain gated for E5/E6.</p>
      <nav className="route-grid" aria-label="Control Center surfaces">
        <Link href="/mission-control">Mission Control</Link>
        <Link href="/github">GitPulse</Link>
      </nav>
    </main>
  );
}
