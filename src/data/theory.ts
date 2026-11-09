export type ChapterId = 'reduction' | 'clustering' | 'anomaly' | 'association';
export type MethodId = 'pca' | 'tsne' | 'umap' | 'kmeans' | 'dbscan' | 'gmm' | 'isolation' | 'apriori';

export interface TheoryMethod {
  id: MethodId;
  name: string;
  subtitle: string;
  idea: string;
  input: string[];
  output: string[];
  steps: string[];
  parameters: [string, string][];
  reading: string;
  caution: string;
  lab: string;
  illustration: string;
  reference: { label: string; href: string };
}
export interface TheoryChapter {
  id: ChapterId;
  number: string;
  coverTitle: string;
  title: string;
  subtitle: string;
  methods: TheoryMethod[];
}

const sklearn = 'https://scikit-learn.org/stable/modules/generated/';

export const theoryChapters: TheoryChapter[] = [
  {
    id: 'reduction', number: '01', coverTitle: 'PCA', title: 'Dimensionality Reduction',
    subtitle: 'Find a perspective on high-dimensional data.',
    methods: [
      {
        id: 'pca', name: 'PCA', subtitle: 'A new set of axes. The same observations.',
        idea: 'PCA finds perpendicular directions of greatest variance. It projects the data onto a smaller set of these directions, giving each row a new set of coordinates.',
        input: ['A numeric matrix: N observations × D selected features.', 'Numeric features; PCA centers them. Choose Z-score or Min–max when scales differ.', 'No target labels are used to find the components.'],
        output: ['Three coordinates per retained row in this lab: PC1, PC2 and PC3.', 'Component vectors describing the contribution of the input features.', 'Explained-variance ratios for the components and their total.'],
        steps: ['Center each feature around its mean.', 'Measure how features vary together using the covariance matrix.', 'Find the leading component directions.', 'Project each observation onto those directions.'],
        parameters: [['Features', 'Choose meaningful numeric columns; exclude identifiers.'], ['Normalization', 'Bring different measurement scales onto a comparable basis.']],
        reading: 'A point is still one source row. Component axes combine features. Check explained variance before interpreting the visible arrangement.',
        caution: 'Variance is not the same as usefulness. A clear-looking projection does not establish real groups, and a linear projection can miss curved structure.',
        lab: 'Model → Preprocessing → Reduction → PCA. The project computes three components using covariance, power iteration and deflation.',
        illustration: 'An elongated cloud projected onto its leading direction. The diagram uses two dimensions to explain the idea; Model displays three components.',
        reference: { label: 'PCA · scikit-learn', href: sklearn + 'sklearn.decomposition.PCA.html' },
      },
      {
        id: 'tsne', name: 't-SNE', subtitle: 'Bring similar neighborhoods into view.',
        idea: 't-SNE converts pairwise similarities into probabilities and seeks a low-dimensional arrangement that emphasizes local relationships.',
        input: ['A numeric feature vector for each observation.', 'Prepared features with a meaningful notion of distance.', 'A perplexity smaller than the number of observations.'],
        output: ['A three-dimensional embedding in Model.', 'One embedded point for each retained input row.', 'A view of neighborhood structure, without feature-based component axes.'],
        steps: ['Estimate similarities in the feature space.', 'Initialize a low-dimensional arrangement.', 'Move points to reduce the mismatch between similarities.', 'Inspect stability across settings and repeated runs.'],
        parameters: [['Perplexity', 'Changes the scale of neighborhoods considered.'], ['Learning rate', 'Controls the size of optimization updates.'], ['Iterations', 'Sets the optimization budget.']],
        reading: 'Look for nearby observations and inspect their source features. Compare more than one configuration before interpreting separated islands.',
        caution: 'Island sizes and gaps do not directly measure original densities or distances. The layout can change between runs; the axes have no source-feature meaning.',
        lab: 'Model → Reduction → t-SNE. Start with a manageable dataset and rerun after changing its settings.',
        illustration: 'The same colored neighborhoods appear in a new arrangement. Colors track example memberships; gaps between islands have no calibrated meaning.',
        reference: { label: 't-SNE · scikit-learn', href: sklearn + 'sklearn.manifold.TSNE.html' },
      },
      {
        id: 'umap', name: 'UMAP', subtitle: 'Build a graph. Reveal its structure.',
        idea: 'UMAP builds a weighted neighborhood graph and optimizes a lower-dimensional representation of its relationships.',
        input: ['Numeric observations after feature selection and preparation.', 'A neighborhood size appropriate to the dataset.', 'No target classes are required for this lab’s embedding.'],
        output: ['Three embedding coordinates per retained row in Model.', 'An arrangement that can reveal local neighborhoods and broader connections.', 'A visual representation whose axes are not original features.'],
        steps: ['Find nearby observations in the feature space.', 'Build a weighted graph of neighborhood relationships.', 'Optimize the graph’s arrangement in fewer dimensions.', 'Compare stable structures across configurations.'],
        parameters: [['n_neighbors', 'Balances more local and broader neighborhood structure.'], ['min_dist', 'Controls how tightly embedded points may pack together.']],
        reading: 'Check whether neighborhoods persist when you adjust both settings. Follow up with the original features and actual source rows.',
        caution: 'An embedding can create visually compelling separation. Its distances and densities are not guaranteed to reproduce the input space.',
        lab: 'Model → Reduction → UMAP. This website uses its own TypeScript implementation; the reference explains the underlying method.',
        illustration: 'Neighborhood links become an embedding. Only some graph edges are shown so the relationships remain readable.',
        reference: { label: 'UMAP · official parameter guide', href: 'https://umap-learn.readthedocs.io/en/latest/parameters.html' },
      },
    ],
  },
  {
    id: 'clustering', number: '02', coverTitle: 'Clustering', title: 'Clustering',
    subtitle: 'Discover groups in the data.',
    methods: [
      {
        id: 'kmeans', name: 'K-Means', subtitle: 'Find groups around shared centers.',
        idea: 'K-Means assigns observations to a chosen number of groups, repeatedly updating each center to the mean of its assigned observations.',
        input: ['Numeric coordinates and a chosen cluster count, k.', 'In this lab, the completed three-dimensional projection is clustered.', 'Distances therefore depend on the selected projection.'],
        output: ['One cluster assignment per point.', 'A center for each group.', 'Cluster counts and comparison metrics in Model.'],
        steps: ['Choose initial centers.', 'Assign each point to the nearest center.', 'Update each center to its group mean.', 'Repeat until the assignments settle or the iteration limit is reached.'],
        parameters: [['k', 'Sets how many clusters to form.'], ['Projection', 'Changing reduction settings changes the space being clustered.']],
        reading: 'Colors show assignments, not known classes. Compare cluster sizes, geometry and silhouette scores across several choices of k.',
        caution: 'K-Means favors compact groups under its distance objective. Extreme values, unequal spread and curved groups can make its partitions misleading.',
        lab: 'Model → Reduction → Clustering → K-Means. Run the analysis again to apply a new k.',
        illustration: 'Three example groups and their centers. A cross marks a center; it is not an additional observation.',
        reference: { label: 'K-Means · scikit-learn', href: sklearn + 'sklearn.cluster.KMeans.html' },
      },
      {
        id: 'dbscan', name: 'DBSCAN', subtitle: 'Follow density, not a preset group count.',
        idea: 'DBSCAN grows groups from points with enough nearby neighbors, connects density-reachable observations, and leaves other points as noise.',
        input: ['Numeric coordinates with meaningful distances.', 'A neighborhood radius, epsilon, and a density threshold, minPts.', 'This lab applies these settings to the three-dimensional projection.'],
        output: ['Cluster assignments and a noise category.', 'A discovered number of clusters, rather than a chosen k.', 'Noise counts that should be reviewed alongside the groups.'],
        steps: ['Search within epsilon of a point.', 'Identify sufficiently dense core neighborhoods.', 'Expand connected dense regions and attach border points.', 'Mark points outside all expanded groups as noise.'],
        parameters: [['Epsilon', 'Defines the radius of a neighborhood.'], ['minPts', 'Controls the minimum neighborhood density.']],
        reading: 'Inspect irregular shapes and the amount of noise. Changing the projection can change both the groups and which points count as noise.',
        caution: 'One radius may not suit groups with very different densities. Noise means unassigned by this configuration, not necessarily an error or an anomaly.',
        lab: 'Model → Clustering → DBSCAN. Review epsilon after switching between PCA, t-SNE and UMAP.',
        illustration: 'Two curved groups with isolated noise points. Dashed circles illustrate the neighborhood radius.',
        reference: { label: 'DBSCAN · scikit-learn', href: sklearn + 'sklearn.cluster.DBSCAN.html' },
      },
      {
        id: 'gmm', name: 'GMM', subtitle: 'Allow groups to overlap.',
        idea: 'A Gaussian Mixture Model describes the data using several Gaussian components. Each observation receives a probability of membership in every component.',
        input: ['Numeric observations and a chosen component count.', 'In Model, the observations are projected three-dimensional coordinates.', 'The project fits a diagonal covariance for each component.'],
        output: ['A membership-probability vector for every point.', 'A displayed label from the highest-probability component.', 'Component weights, means, variances, and AIC/BIC in Model.'],
        steps: ['Initialize component parameters.', 'E-step: estimate each point’s membership probabilities.', 'M-step: update component weights, means and variances.', 'Repeat until convergence or the iteration limit.'],
        parameters: [['Components', 'Sets the number of Gaussian components.'], ['Iterations / tolerance', 'Control the optimization budget and stopping criterion.'], ['Seed', 'Helps reproduce initialization on the same data.']],
        reading: 'Points in an overlap may have uncertain membership. Compare AIC/BIC only on the same observations and representation.',
        caution: 'Membership probability is not prediction accuracy. Diagonal covariance cannot represent within-component feature correlations.',
        lab: 'Model → Clustering → GMM. Inspect membership confidence alongside the displayed cluster color.',
        illustration: 'Overlapping axis-aligned Gaussian contours and example memberships. Contours represent component spread, not hard boundaries.',
        reference: { label: 'Gaussian mixtures · scikit-learn', href: sklearn + 'sklearn.mixture.GaussianMixture.html' },
      },
    ],
  },
  {
    id: 'anomaly', number: '03', coverTitle: 'Anomaly Detection', title: 'Anomaly Detection',
    subtitle: 'Find observations worth a closer look.',
    methods: [
      {
        id: 'isolation', name: 'Isolation Forest', subtitle: 'Unusual observations are often easier to isolate.',
        idea: 'Isolation Forest uses many random partition trees. Observations reached through shorter average paths receive higher anomaly scores in this project.',
        input: ['Selected numeric features from the source dataset, before 3D reduction.', 'Missing numeric values are imputed with their feature means in this lab.', 'Tree count, sample size, contamination and a random seed.'],
        output: ['One anomaly score per source row.', 'Flags based on a score threshold; tied scores can increase the flagged proportion.', 'A dashboard with score distributions and source-row inspection.'],
        steps: ['Sample observations for a tree.', 'Randomly choose features and split values.', 'Measure how many splits isolate each observation.', 'Average path lengths and convert them into anomaly scores.'],
        parameters: [['Trees', 'Controls how many random partitions contribute to a score.'], ['Sample size', 'Sets the sample used to build each tree.'], ['Contamination', 'Sets the target flagged fraction used to choose the threshold.'], ['Seed', 'Makes random sampling reproducible.']],
        reading: 'Higher scores in this lab indicate observations to inspect. Use Locate row in 3D to find a retained row in the current view; the score is computed in the input-feature space.',
        caution: 'A flagged observation is not automatically wrong. Scores are not error probabilities, and source context is needed to interpret an unusual row.',
        lab: 'Model → Setup → Anomaly Detection. Run Isolation Forest to open its dashboard.',
        illustration: 'A random partition separates a distant observation with relatively few cuts. The drawing is conceptual and does not report computed scores.',
        reference: { label: 'Isolation Forest · scikit-learn', href: sklearn + 'sklearn.ensemble.IsolationForest.html' },
      },
    ],
  },
  {
    id: 'association', number: '04', coverTitle: 'Association Rules', title: 'Association Rules',
    subtitle: 'Discover what tends to occur together.',
    methods: [
      {
        id: 'apriori', name: 'Apriori', subtitle: 'Turn co-occurrences into readable rules.',
        idea: 'Apriori grows frequent itemsets and uses them to generate rules such as Bread → Milk. Rules describe co-occurrence rather than cause and effect.',
        input: ['Original rows encoded as sets of items, one transaction per row.', 'Selected categorical values and discretized numeric ranges.', 'Minimum support, confidence, lift and a maximum itemset size.'],
        output: ['Frequent sets of items and qualifying A → B rules.', 'Support, confidence and lift for each rule.', 'Matching source rows that can be inspected or highlighted in the current 3D view.'],
        steps: ['Encode selected values as transaction items.', 'Count frequent individual items.', 'Grow candidates from frequent smaller itemsets.', 'Generate rules and filter them using the selected thresholds.'],
        parameters: [['Support', 'The fraction of transactions containing both sides.'], ['Confidence', 'The fraction of A-transactions that also contain B.'], ['Lift', 'Confidence divided by the occurrence rate of B.'], ['Bins / max itemset size', 'Control numeric encoding and how large item combinations may become.']],
        reading: 'Support = P(A ∩ B), confidence = P(B | A), lift = confidence / P(B). A lift above 1 indicates more co-occurrence than the independent baseline in this dataset.',
        caution: 'A rule is not a causal claim. Low support and changes to numeric bins can produce unstable or very different rules.',
        lab: 'Model → Setup → Association Rules. ID and label columns are excluded; the algorithm uses original rows rather than reduced coordinates.',
        illustration: 'A complete six-transaction example. Bread appears four times, Milk four times, and both appear three times.',
        reference: { label: 'Association rules · mlxtend', href: 'https://rasbt.github.io/mlxtend/user_guide/frequent_patterns/association_rules/' },
      },
    ],
  },
];

export function theoryHref(chapter: ChapterId, method?: MethodId) {
  return '#/theory?chapter=' + chapter + (method ? '&method=' + method : '');
}

export function theorySelection(hash: string) {
  const [route, query = ''] = hash.split('?');
  if (route !== '#/theory') return null;
  const params = new URLSearchParams(query);
  const chapter = theoryChapters.find(item => item.id === params.get('chapter'));
  if (!chapter) return null;
  const method = chapter.methods.find(item => item.id === params.get('method')) ?? chapter.methods[0];
  return { chapter, method };
}

export const exampleTransactions = [
  ['Bread', 'Milk'], ['Bread', 'Milk'], ['Bread', 'Milk'], ['Bread'], ['Milk'], ['Tea'],
];
export const associationExample = (() => {
  const total = exampleTransactions.length;
  const antecedent = exampleTransactions.filter(row => row.includes('Bread')).length;
  const consequent = exampleTransactions.filter(row => row.includes('Milk')).length;
  const together = exampleTransactions.filter(row => row.includes('Bread') && row.includes('Milk')).length;
  const confidence = together / antecedent;
  return { total, antecedent, consequent, together, support: together / total, confidence, lift: confidence / (consequent / total) };
})();
