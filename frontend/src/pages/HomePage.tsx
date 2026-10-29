import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import Navigation from '../sections/Navigation';
import Hero from '../sections/Hero';
import Services from '../sections/Services';
import Process from '../sections/Process';
import Practice from '../sections/Practice';
import Contact from '../sections/Contact';
import Footer from '../sections/Footer';

export default function HomePage() {
  const { hash } = useLocation();
  const [prefill, setPrefill] = useState('');

  // Links such as /#contact come from other pages too, so scrolling is handled here
  // rather than with a click handler in the navigation.
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  const requestFromCheck = useCallback((message: string) => {
    setPrefill(message);
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('contact')?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth' });
  }, []);

  return (
    <div className="min-h-screen bg-site-base text-site-text overflow-x-hidden">
      <Navigation />
      <main>
        <Hero onRequest={requestFromCheck} />
        <Services />
        <Process />
        <Practice />
        <Contact initialMessage={prefill} />
      </main>
      <Footer />
    </div>
  );
}
