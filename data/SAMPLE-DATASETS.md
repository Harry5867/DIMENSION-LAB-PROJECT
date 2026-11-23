# Sample datasets in Dimension Lab

The five CSVs in `public/samples` are educational adaptations. The `id` column points to a one-based source row within the selected file or split. The `label` column preserves the source class (with readable names where it used numeric codes). Both fields are excluded from the feature matrix used for reduction and clustering.

| Sample | Attribution and license | Adaptation |
| --- | --- | --- |
| Palmer Penguins | [Kristen Gorman and Palmer Station LTER, curated by Horst, Hill and Gorman](https://allisonhorst.github.io/palmerpenguins/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). | All 344 rows from the curated `penguins.csv`. Kept four physical measures, island, sex and species. Source `NA` becomes an empty cell. The existing analysis pipeline imputes missing numerical values from the column mean. |
| Wheat Seeds | [Charytanowicz, Niewczas, Kulczycki, Kowalski and Lukasik](https://doi.org/10.24432/C5H30K), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). | All 210 rows. Added headers and converted the class codes to Kama, Rosa and Canadian. |
| Banknote Authentication | [Volker Lohweg](https://doi.org/10.24432/C55P57), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). | 450 rows per source class, four wavelet features. |
| Smartphone Activity | [Reyes-Ortiz, Anguita, Ghio, Oneto and Parra](https://doi.org/10.24432/C54S4K), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). | 100 rows per activity from the test split. Kept mean and standard deviation on all three axes for body acceleration, gravity acceleration, body acceleration jerk and body gyroscope (24 features). |
| Handwritten Digits | [E. Alpaydin and C. Kaynak](https://doi.org/10.24432/C50P49), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). | 90 rows per digit from `optdigits.tes`. The CSV retains all 64 pixel cells. The app detects 58 varying pixel columns for analysis. |

For sampled sets, the build script selects evenly spaced rows within each class and restores source row order. The balanced subsets represent demo inputs. Their class frequencies differ from those in the original sources.

To regenerate, download the [curated penguin CSV](https://raw.githubusercontent.com/allisonhorst/palmerpenguins/main/inst/extdata/penguins.csv), [seeds text](https://archive.ics.uci.edu/ml/machine-learning-databases/00236/seeds_dataset.txt), [banknote text](https://archive.ics.uci.edu/ml/machine-learning-databases/00267/data_banknote_authentication.txt) and [optical digits test split](https://archive.ics.uci.edu/ml/machine-learning-databases/optdigits/optdigits.tes). Save them as `dimension-lab-source-penguins.csv`, `dimension-lab-source-seeds.txt`, `dimension-lab-source-banknote.txt`, and `dimension-lab-source-digits.txt`. From the nested Smartphone Activity archive, save `activity_labels.txt`, `features.txt`, `test/X_test.txt`, and `test/y_test.txt` in the same folder with the prefix `dimension-lab-har-`.

Run `node scripts/prepare-sample-datasets.mjs <source-folder>` from the repository. Run `node --import tsx --test tests/unit/sample-datasets.test.ts` to validate the prepared data against the Workspace algorithms.
