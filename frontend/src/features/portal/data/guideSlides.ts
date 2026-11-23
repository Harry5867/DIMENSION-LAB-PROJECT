import type { GuideChapter } from '../../../shared/navigation/portalNavigation';

interface GuideSlide {
  image: string;
  title: string;
  description: string;
}

export const guideSlides: Record<GuideChapter['slug'], readonly [GuideSlide, ...GuideSlide[]]> = {
  'quick-start': [
    { image: 'manage-datasets', title: 'Open Datasets', description: 'In Explore, open Setup and expand the current dataset. Select Manage datasets to open Datasets.' },
    { image: 'choose-dataset', title: 'Select Wholesale Customers', description: 'Find Wholesale Customers under Sample datasets and select Use dataset. If the dataset is already Active, select Open Explore to return to the plot.' },
    { image: 'choose-features', title: 'Choose numeric columns', description: 'In Explore, open Setup, expand Wholesale Customers, and open Features. Select Clear, then select Fresh, Milk, and Grocery for the 3D plot.' },
    { image: 'z-score', title: 'Standardize the data', description: 'Open Preprocessing and select Z-score. This puts the columns on a comparable scale when you run the analysis.' },
    { image: 'pca', title: 'Select PCA', description: 'Open Reduction and select PCA. The result will represent the data on three summary axes labeled PC1, PC2, and PC3.' },
    { image: 'k-means', title: 'Set the K-Means cluster count', description: 'Under Clustering, select K-Means and set Cluster count to 3. Use this value for the exercise, then try other cluster counts.' },
    { image: 'run-analysis', title: 'Run the analysis', description: 'Select Run analysis to apply the current settings. When the run finishes, the data points will appear on the 3D plot.' },
    { image: 'result', title: 'View the 3D results', description: 'Check the settings above the plot. Each point represents one customer, and its color shows the cluster assigned by K-Means.' },
  ],
  'import-csv': [
    { image: 'import-csv', title: 'Choose a CSV file', description: 'In Datasets, select Import CSV and choose a CSV file with a header row. If the file is valid, the dataset will appear under Imported datasets.' },
    { image: 'open-imported', title: 'Open the imported dataset', description: 'Find the dataset marked Active under Imported datasets and select Open Explore. The dataset name will appear in Setup.' },
    { image: 'view-data', title: 'View the source data', description: 'In Setup, expand the section named after your dataset and select View data. The Raw data table will show the original columns and values.' },
    { image: 'column-headers', title: 'Check column names and values', description: 'Read the headers and the first few rows to identify numeric columns such as Fresh, Milk, and Grocery. Check for blank cells or text in numeric columns before selecting features.' },
    { image: 'csv-features', title: 'Select columns for analysis', description: 'Close the table and open Features in Setup. Select at least three suitable numeric columns to build the 3D plot.' },
  ],
  'understand-results': [
    { image: 'explore-3d', title: 'Rotate and zoom the plot', description: 'Drag the plot to rotate it and scroll to zoom. On a touchscreen, pinch with two fingers to zoom.' },
    { image: 'point-inspector', title: 'Inspect a point’s source values', description: 'Select a point on the plot. Insights will open the Selection tab and show the Point ID and original values, such as Milk.' },
    { image: 'insights', title: 'Read metrics and cluster sizes', description: 'Open Insights → Metrics to see the number of points in each cluster and the Silhouette score, when available. A score closer to 1 indicates better separation between clusters in 3D.' },
    { image: 'anomaly-detection', title: 'Inspect an anomalous row', description: 'In Setup → Anomaly Detection, select Run Isolation Forest. In the results table, select Inspect row on a row marked Anomaly to see its original values.' },
    { image: 'association-rules', title: 'View rows that match a rule', description: 'In Setup → Association Rules, select columns and choose Run Apriori. Review Support, Confidence, and Lift in the table, then select a rule to see its matching rows.' },
  ],
  'save-and-export': [
    { image: 'export-csv', title: 'Download point data', description: 'Run an analysis, open Export, and select Point data (.csv). The download includes the source rows for the result points, their 3D coordinates, and predicted clusters when available.' },
    { image: 'export-png', title: 'Save an image of the plot', description: 'Rotate the plot to the angle you want to save, open Export, and select Current 3D view (.png). The image captures the current view.' },
    { image: 'export-json', title: 'Download the analysis report', description: 'In Export, select Experiment report (.json). The file includes dataset details, the configuration, and metrics for the run.' },
    { image: 'save-experiment', title: 'Save an experiment', description: 'After running the analysis with the current settings, open Insights → More insights and select Save experiment. The app saves the settings and metrics when the history service is available.' },
    { image: 'experiments', title: 'Reopen a saved experiment', description: 'Select History in More insights to open Experiments when the service is available. Open Saved configuration, select Restore settings with the original dataset active, then rerun the analysis in Explore.' },
  ],
  troubleshooting: [
    { image: 'run-disabled', title: 'The run button is disabled', description: 'If Run analysis or Rerun analysis is disabled, open Setup → Features and check that at least three numeric columns are selected. Wait for any active task to finish before trying again.' },
    { image: 'rerun-analysis', title: 'The plot still shows the previous result', description: 'If you see Pending after changing columns or settings, select Rerun analysis. The plot and Insights will update when the new run finishes.' },
    { image: 'apriori-thresholds', title: 'Apriori found no rules', description: 'If the results table is empty, lower Minimum support (0–1) or Minimum confidence (0–1) in Association Rules, then select Run Apriori. If filters are active in the results table, select Clear filters first.' },
    { image: 'save-disabled', title: 'The experiment won’t save', description: 'If Save experiment is disabled, rerun the analysis with the new settings and wait for it to finish. If the history service reports an error, use Export → Experiment report (.json) to keep the settings and metrics.' },
    { image: 'dbscan', title: 'DBSCAN shows many noise points', description: 'If Insights shows many points marked Noise, try increasing Radius (ε) or decreasing Minimum points in small steps under Clustering, then select Rerun analysis. Check the Noise count after each run.' },
  ],
};
