import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { LabMark } from './LabMark';
import { useDialogFocus } from '../utils/useDialogFocus';
import { DEMO_EMAIL, DEMO_PASSWORD, validDemoCredentials } from '../utils/demoSession';
import './welcome.css';

const DataGlobe = lazy(() => import('./DataGlobe').then(module => ({ default: module.DataGlobe })));
const concepts = [
  { name: 'Data', text: 'Every point holds a story. Start with the data you want to understand.' },
  { name: 'Dimensions', text: 'Look beyond individual features. Find a new perspective in three dimensions.' },
  { name: 'Patterns', text: 'Reveal relationships that are difficult to see in a table.' },
  { name: 'Clusters', text: 'Discover natural groups and the points that stand apart.' },
  { name: 'Exploration', text: 'Rotate, inspect, and experiment. Let curiosity guide the next question.' },
];

function LoginPanel({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }) {
  const dialog = useDialogFocus(true, onClose, 'input[type=email]');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  return <div className="login-backdrop" onClick={onClose}>
    <div className="login-panel" role="dialog" aria-modal="true" aria-labelledby="login-title" tabIndex={-1} ref={dialog} onClick={event => event.stopPropagation()}>
      <header><span>DIMENSION / LAB — ACCESS</span><button aria-label="Close login panel" onClick={onClose}><X size={18} /></button></header>
      <LabMark className="login-logo" />
      <h2 id="login-title">Sign in</h2>
      <form onSubmit={event => { event.preventDefault(); if (!validDemoCredentials(email, password)) { setError('Email or password is incorrect. Use the demo account below.'); return; } onSignIn(); }}>
        <label htmlFor="login-email">Email address</label>
        <input id="login-email" type="email" autoComplete="username" placeholder="you@example.com" value={email} required onChange={event => { setEmail(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} />
        <div className="login-password-label"><label htmlFor="login-password">Password</label></div>
        <div className="login-password"><input id="login-password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={event => { setPassword(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(value => !value)}>{visible ? 'HIDE' : 'SHOW'}</button></div>
        {error && <p role="alert" id="login-error" className="login-error">{error}</p>}
        <button className="welcome-primary login-submit" type="submit">Sign in <ArrowUpRight size={17} /></button>
      </form>
      <div className="login-demo">
        <button type="button" className="lab-action" onClick={() => { setEmail(DEMO_EMAIL); setPassword(DEMO_PASSWORD); setError(''); }}>Use demo account <ArrowUpRight size={14} /></button>
        <details><summary>Demo account help</summary><p>This preview uses a shared demo account.</p><p>{DEMO_EMAIL}<br />Password: {DEMO_PASSWORD}</p></details>
      </div>
    </div>
  </div>;
}

export function Welcome({ onSignIn }: { onSignIn: () => void }) {
  const [login, setLogin] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [section, setSection] = useState<'about' | 'methodology' | null>(null);
  const concept = active === null ? null : concepts[active];
  useEffect(() => { document.title = 'Dimension Lab — A world of dimensions'; return () => { document.title = 'Dimension Lab — Interactive Data Exploration'; }; }, []);
  const selectConcept = (index: number) => {
    setActive(current => current === index ? null : index);
    setSection(null);
  };
  const openLogin = () => { setSection(null); setActive(null); setLogin(true); };
  const toggleAbout = () => {
    setActive(null);
    setSection(current => current === null ? 'about' : null);
  };
  return <div className="welcome-page">
    <header className="welcome-header">
      <a href="#/" className="workspace-brand" aria-label="Dimension Lab welcome">
        <LabMark className="welcome-mark" /> DIMENSION <span className="brand-slash">/</span> LAB <small className="welcome-version">V.02</small>
      </a>
      <nav aria-label="Welcome navigation">
        <button aria-expanded={section !== null} onClick={toggleAbout}>ABOUT</button>
      </nav>
      <nav className="welcome-concepts" aria-label="Globe concepts">
        {concepts.map((item, index) => (
          <button key={item.name} aria-label={'Discover ' + item.name.toLowerCase()}
            aria-pressed={active === index} onClick={() => selectConcept(index)}>
            {String(index + 1).padStart(2, '0')}
          </button>
        ))}
      </nav>
    </header>
    <main className="welcome-main">
      <section className="welcome-copy">
        <p className="welcome-eyebrow"><span /> THE DATA EXPLORATION LAB</p>
        <h1>LESS NOISE.<br />MORE DIMENSION<span className="welcome-period">.</span></h1>
        <p className="welcome-description">DISCOVER PATTERNS BEYOND WHAT YOU CAN SEE.</p>
        <div className="welcome-actions"><button className="welcome-primary" onClick={openLogin}>ENTER THE LAB <ArrowUpRight size={17} /></button></div>
      </section>
      <Suspense fallback={<div className="data-globe globe-loading" role="status">Loading the data globe…</div>}>
        <DataGlobe suspended={login} showDetails={active === null && section === null}
          onExplore={() => { setActive(null); setSection(null); }} />
      </Suspense>
      {concept && <section className="welcome-concept" aria-labelledby="welcome-concept-title">
        <button type="button" aria-label="Close concept" onClick={() => setActive(null)}><X size={16} /></button>
        <p className="welcome-eyebrow">THE DATA EXPLORATION LAB</p>
        <h2 id="welcome-concept-title">{concept.name}</h2>
        <p>{concept.text}</p>
      </section>}
      {section && <section className="welcome-concept" aria-labelledby="welcome-information-title">
        <button aria-label="Close information" onClick={() => setSection(null)}><X size={16} /></button>
        <p className="welcome-eyebrow">{section === 'about' ? '01 / THE IDEA' : '02 / THE APPROACH'}</p>
        <h2 id="welcome-information-title">{section === 'about' ? 'Complex data. Clearer perspectives.' : 'From data to discovery.'}</h2>
        <p>{section === 'about'
          ? 'Dimension Lab is a space for exploring the structures hidden in high-dimensional data.'
          : 'Import a CSV and prepare your features. Explore PCA, t-SNE, or UMAP, then isolate clusters, inspect points, and compare experiments.'}</p>
        {section === 'about'
          ? <button className="welcome-information-action" onClick={() => setSection('methodology')}>Methodology <ArrowUpRight size={14} /></button>
          : <button className="welcome-information-action" onClick={openLogin}>Step into the lab <ArrowUpRight size={14} /></button>}
      </section>}
    </main>
    <footer className="welcome-footer"><span>01 <i /> EXPLORATION BEGINS HERE</span></footer>
    {login && <LoginPanel onClose={() => setLogin(false)} onSignIn={onSignIn} />}
  </div>;
}

