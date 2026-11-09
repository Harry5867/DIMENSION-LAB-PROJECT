import { useAppLanguage } from "./WelcomeLanguage";
import { lazy, Suspense } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { PortalRoute } from '../utils/portalNavigation';

const DatasetStories = lazy(() => import('./DatasetStories'));
const Theory = lazy(() => import('./Theory').then(module => ({ default: module.Theory })));
function Guide() {
  const { tr } = useAppLanguage();
  return <div className="portal-prose"><h2>{tr("Your first exploration.")}</h2><p>{tr("Try a built-in dataset before importing your own CSV. Use Go back to return to Workspace. In a Theory chapter, select All chapters first to return to the collection.")}</p>
    <ol>
      <li><strong>{tr("Choose a dataset.")}</strong> {tr("Open Model → Dataset and choose a sample or import a CSV. Check column names, IDs, labels and numeric features before running an analysis.")}</li>
      <li><strong>{tr("Prepare the data.")}</strong> {tr("Select meaningful features. Z-score brings different scales onto a comparable basis. The 3D view requires at least three numeric features.")}</li>
      <li><strong>{tr("Reduce dimensions and cluster.")}</strong> {tr("Start with PCA, then choose K-Means, DBSCAN or GMM. Select Run analysis. After changing settings, rerun to update the results.")}</li>
      <li><strong>{tr("Explore in 3D.")}</strong> {tr("Drag to rotate, scroll to zoom and select a point to inspect its source data. On smaller screens, use Setup and Insights to open the panels.")}</li>
      <li><strong>{tr("Find anomalies.")}</strong> {tr("Open Anomaly Detection in Setup, configure Isolation Forest and run it. The dashboard shows scores, statistics and source rows. Inspect a row and use the action to locate it in 3D.")}</li>
      <li><strong>{tr("Discover association rules.")}</strong> {tr("Open Association Rules, choose columns and thresholds, then run Apriori. Select a rule to inspect both sides, support, confidence, lift and matching rows. You can highlight matching rows in the current 3D view.")}</li>
      <li><strong>{tr("Save and compare.")}</strong> {tr("Export downloads the result you are viewing. Save locally in either dashboard keeps a run in this browser; Export JSON downloads a copy. Experiments requires the history service.")}</li>
    </ol>
    <div className="portal-note"><strong>{tr("On slower devices:")}</strong> {tr("start with PCA and a single view. Limit live t-SNE, dual view and multiple 3D tabs. The Workspace preview pauses when you open a section.")}</div>
    <h2>{tr("Troubleshooting")}</h2><p>{tr("No rules? Lower support or confidence, or select fewer columns. Too much noise? Check normalization and DBSCAN epsilon. Cannot find a row in 3D? Check whether it was removed and select enough numeric features. Local saving unavailable? Export JSON to keep your result.")}</p>
    <a className="portal-action" href="#/explore">{tr("Open Model")} <ArrowUpRight size={16} /></a>
  </div>;
}

function About() {
  const { tr } = useAppLanguage();
  return <div className="portal-prose"><h2>{tr("Make complex data visible.")}</h2><p>{tr("This project is a space for learning and practicing high-dimensional data visualization. It connects dimensionality reduction, clustering, anomaly detection and association rules with interactive data exploration.")}</p>
    <h2>{tr("What are we building?")}</h2><p>{tr("A workflow that takes learners from theory to experimentation: understand an algorithm, adjust its settings, explore the results and check findings against individual source rows.")}</p>
    <div className="portal-team-placeholder"><strong>{tr("Team information — Coming soon")}</strong><p>{tr("The official project title, team members and their roles will be added when the team provides this information.")}</p></div>
    <a className="portal-action" href="#/theory">{tr("Explore the theory")} <ArrowUpRight size={16} /></a>
  </div>;
}

export function PortalContent({ route }: { route: PortalRoute }) {
  const { tr } = useAppLanguage();
  if (route === 'theory') return <Suspense fallback={<p role="status">{tr("Loading theory…")}</p>}><Theory /></Suspense>;
  if (route === 'guide') return <Guide />;
  if (route === 'about') return <About />;
  if (route === 'library') return <Suspense fallback={<p role="status">{tr("Loading data stories…")}</p>}><DatasetStories /></Suspense>;
  return null;
}
