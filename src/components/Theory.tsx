import { useAppLanguage } from "./WelcomeLanguage";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen } from 'lucide-react';
import { associationExample, exampleTransactions, theoryHref, theorySelection, type ChapterId, type TheoryMethod } from '../data/theory';
import { getTheoryChapters } from '../data/localizedTheory';
import { TheoryIllustration } from './TheoryIllustrations';
import { ThemeToggle } from './ThemeToggle';
import './theory.css';

const coverAngles = [-7, -2, 2, 7];
const coverMethods = ['pca', 'kmeans', 'isolation', 'apriori'] as const;
const pipeline: Record<ChapterId, [string, string]> = {
  reduction: ['N × D numeric features', 'N × 3 coordinates'],
  clustering: ['Projected coordinates', 'Group assignments'],
  anomaly: ['Original numeric features', 'Scores + flagged rows'],
  association: ['Row transactions', 'Frequent items + rules'],
};

function AssociationExample() {
  const { tr } = useAppLanguage();
  const example = associationExample;
  return <section className="theory-example" aria-labelledby="theory-example-title">
    <div className="theory-section-label">{tr("WORKED EXAMPLE")}</div><h3 id="theory-example-title">{tr("From six baskets to one rule.")}</h3>
    <p>{tr("A small teaching dataset. These transactions are independent of the dataset loaded in Model.")}</p>
    <div className="theory-example-grid">
      <table><caption>{tr("Input · six transactions")}</caption><thead><tr><th scope="col">{tr("Row")}</th><th scope="col">{tr("Items")}</th></tr></thead><tbody>{exampleTransactions.map((row, i) => <tr key={i}><th scope="row">{String(i + 1).padStart(2, '0')}</th><td>{row.map(tr).join(' · ')}</td></tr>)}</tbody></table>
      <div className="theory-example-result"><span className="theory-section-label">{tr("OUTPUT · BREAD → MILK")}</span><dl>
        <div><dt>{tr("Support")}</dt><dd>{example.together} / {example.total} = {example.support * 100}%</dd></div>
        <div><dt>{tr("Confidence")}</dt><dd>{example.together} / {example.antecedent} = {example.confidence * 100}%</dd></div>
        <div><dt>Lift</dt><dd>0.75 / (4 / 6) = {example.lift.toFixed(3)}</dd></div>
      </dl><p>{tr("Three of six baskets contain both items. Of the four baskets with Bread, three also have Milk.")}</p></div>
    </div>
  </section>;
}

function MethodContent({ method, chapterId }: { method: TheoryMethod; chapterId: ChapterId }) {
  const { tr } = useAppLanguage();
  const [input, baseOutput] = pipeline[chapterId];
  const output = method.id === 'gmm' ? 'Membership probabilities' : method.id === 'dbscan' ? 'Clusters + noise' : baseOutput;
  return <article className="theory-method-content" key={method.id} aria-labelledby="theory-method-title">
    <div className="theory-method-intro"><p className="theory-section-label">{tr("THE IDEA")}</p><h2 id="theory-method-title">{method.subtitle}</h2><p>{method.idea}</p></div>
    <div className="theory-pipeline" aria-label={tr("Input, algorithm, and output")}><span><small>{tr("INPUT")}</small>{tr(input)}</span><ArrowRight size={18} aria-hidden="true" /><strong>{method.name}</strong><ArrowRight size={18} aria-hidden="true" /><span><small>{tr("OUTPUT")}</small>{tr(output)}</span></div>
    <div className="theory-reading-spread">
      <div className="theory-knowledge">
        <section className="theory-io"><div><h3><span>01</span> {tr("Input")}</h3><ul>{method.input.map(item => <li key={item}>{item}</li>)}</ul></div><div><h3><span>02</span> {tr("Output")}</h3><ul>{method.output.map(item => <li key={item}>{item}</li>)}</ul></div></section>
        <section className="theory-steps"><h3><span>03</span> {tr("How it works")}</h3><ol>{method.steps.map(step => <li key={step}>{step}</li>)}</ol></section>
      </div>
      <figure className="theory-method-figure"><div className="theory-figure-heading"><span className="theory-section-label">{tr("VISUAL INTUITION")}</span><span>{method.name}</span></div><TheoryIllustration method={method.id} /><figcaption>{method.illustration}<span>{tr("Conceptual illustration · not a Model run.")}</span></figcaption></figure>
    </div>
    {method.id === 'apriori' && <AssociationExample />}
    <div className="theory-explanation-grid">
      <section><h3><span>04</span> {tr("Parameters to explore")}</h3><dl className="theory-parameters">{method.parameters.map(([name, detail]) => <div key={name}><dt>{name}</dt><dd>{detail}</dd></div>)}</dl></section>
      <div><section><h3><span>05</span> {tr("Reading the result")}</h3><p>{method.reading}</p></section><aside className="theory-caution"><h3>{tr("Keep in mind")}</h3><p>{method.caution}</p></aside></div>
    </div>
    <section className="theory-in-model"><div><span className="theory-section-label">{tr("CONTINUE IN THE LAB")}</span><p>{method.lab}</p></div><a className="theory-practice-link" href="#/methods">{tr("Open Model")} <ArrowUpRight size={17} aria-hidden="true" /></a></section>
    <div className="theory-reference"><span>{tr("Explore the underlying method")}</span><a href={method.reference.href} target="_blank" rel="noreferrer">{method.reference.label} <ArrowUpRight size={14} aria-hidden="true" /></a><p>{tr("References describe the underlying algorithms. Dimension Lab uses its own TypeScript implementations and the settings described above.")}</p></div>
  </article>;
}

export function Theory() {
  const { language, tr, t } = useAppLanguage();
  const chapters = useMemo(() => getTheoryChapters(language), [language]);
  const [hash, setHash] = useState(() => window.location.hash);
  const selection = theorySelection(hash);
  const catalog = useRef<HTMLDivElement>(null), readerTitle = useRef<HTMLHeadingElement>(null);
  const lastChapter = useRef<ChapterId | null>(null), returnScroll = useRef(0);
  useEffect(() => {
    const navigate = () => setHash(window.location.hash);
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  const chapterId = selection?.chapter.id, methodId = selection?.method.id;
  useEffect(() => {
    document.title = `Dimension Lab — ${tr('Theory')}${selection ? ' · ' + selection.method.name : ''}`;
  }, [methodId, selection?.method.name, tr]);
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.portal-page--theory');
    if (chapterId) {
      lastChapter.current = chapterId;
      page?.scrollTo(0, 0); readerTitle.current?.focus({ preventScroll: true });
    } else if (lastChapter.current) {
      page?.scrollTo(0, returnScroll.current);
      catalog.current?.querySelector<HTMLAnchorElement>(`[data-chapter="${lastChapter.current}"]`)?.focus({ preventScroll: true });
    }
  }, [chapterId, methodId]);

  if (selection) {
    const index = chapters.findIndex(item => item.id === selection.chapter.id);
    const chapter = chapters[index];
    const method = chapter.methods.find(item => item.id === selection.method.id) ?? chapter.methods[0];
    const nextChapter = chapters[(index + 1) % chapters.length];
    return <div className="theory-scope theory-reader">
      <div className="portal-page-tools"><a className="theory-back-link" href="#/theory"><ArrowLeft size={15} aria-hidden="true" /> {tr("All chapters")}</a><ThemeToggle /></div>
      <header className="theory-reader-heading portal-content-heading"><p className="theory-section-label"><span data-section-number>{chapter.number}</span> {tr("/ THE THEORY COLLECTION")}</p><h1 ref={readerTitle} tabIndex={-1}>{chapter.title}</h1><p>{chapter.subtitle}</p></header>
      <nav className="theory-method-nav" aria-label={tr("Algorithms in this chapter")}>{chapter.methods.map(item => <a key={item.id} href={theoryHref(chapter.id, item.id)} aria-current={method.id === item.id ? 'page' : undefined}>{item.name}<ArrowUpRight size={14} aria-hidden="true" /></a>)}</nav>
      <MethodContent method={method} chapterId={chapter.id} />
      <footer className="theory-reader-footer"><a href="#/theory"><ArrowLeft size={15} aria-hidden="true" /> {tr("Back to the collection")}</a><a href={theoryHref(nextChapter.id)}>{tr("Next chapter ·")} {nextChapter.title} <ArrowRight size={16} aria-hidden="true" /></a></footer>
    </div>;
  }

  return <div className="theory-scope theory-catalog" ref={catalog}>
    <div className="portal-page-tools"><a className="theory-back-link" href="#/overview"><ArrowLeft size={15} aria-hidden="true" /> {tr("Go back")}</a><ThemeToggle /></div>
    <header className="theory-catalog-heading portal-content-heading"><div className="theory-catalog-meta"><p className="theory-section-label"><span data-section-number>01</span> {tr("/ THEORY")}</p><p className="theory-section-label">{tr("04 CHAPTERS / 08 METHODS")}</p></div><h1>{tr("Theory")}</h1><p>{tr("Understand the algorithms.")}</p></header>
    <nav className="theory-books" aria-label={tr("Theory chapters")}>{chapters.map((chapter, index) => <div key={chapter.id} className="theory-book-slot"
      style={{ '--book-angle': coverAngles[index] + 'deg', '--book-order': index === 1 ? 4 : index === 2 ? 3 : 2, '--book-offset': index === 1 || index === 2 ? '-8px' : '12px' } as CSSProperties}><a
      href={theoryHref(chapter.id)} data-chapter={chapter.id} className={'theory-book theory-book--' + chapter.id}
      aria-label={t('Open ' + chapter.title + ' chapter', 'Mở chương ' + chapter.title)}
      onClick={() => { returnScroll.current = catalog.current?.closest('.portal-page')?.scrollTop ?? 0; }}>
      <div className="theory-book-frame"><div className="theory-book-meta"><span>{chapter.number} / DIMENSION LAB</span><span aria-hidden="true">＋</span></div><div className="theory-book-title"><h2>{chapter.coverTitle}</h2>{chapter.id === 'reduction' && <p>{tr("Dimensionality Reduction")}</p>}</div><TheoryIllustration method={coverMethods[index]} cover /><div className="theory-book-methods">{chapter.methods.map(item => item.name).join(' · ')}</div><span className="theory-book-open">{tr("Explore chapter")} <ArrowUpRight size={16} aria-hidden="true" /></span></div>
    </a></div>)}</nav>
    <p className="theory-catalog-hint"><BookOpen size={15} aria-hidden="true" /><span>{tr("Four perspectives. Select a chapter to explore its input, process and output.")}</span></p>
  </div>;
}
