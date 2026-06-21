import { Nav } from '../components/landing/Nav';
import { Hero } from '../components/landing/Hero';
import { Features } from '../components/landing/Features';
import { HowItWorks } from '../components/landing/HowItWorks';
import { Stats } from '../components/landing/Stats';
import { GitHubSection } from '../components/landing/GitHubSection';
import { Footer } from '../components/landing/Footer';

export default function LandingPage() {
  return (
    <div
      className="landing-brand relative w-full h-full overflow-y-auto overflow-x-hidden scrollbar-hide"
      style={{ background: '#09090b', color: '#f4f4f5' }}
    >
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <Stats />
      <GitHubSection />
      <Footer />
    </div>
  );
}
