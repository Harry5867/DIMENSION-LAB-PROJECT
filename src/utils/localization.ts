import messages from '../data/ui-vi.json';
import type { WelcomeLanguage } from './welcomePreferences';

const vietnamese: Readonly<Record<string, string>> = messages;
const messagePatterns: ReadonlyArray<readonly [RegExp, (...values: string[]) => string]> = [
  [/^Running (.+) in your browser…$/, method => `Đang chạy ${method} trên trình duyệt…`],
  [/^Running (.+)…$/, method => `Đang chạy ${method}…`],
  [/^Clustering with (.+)…$/, method => `Đang phân cụm bằng ${method}…`],
  [/^(K-Means|GMM): k must be an integer from 1 to (\d+)\.$/, (method, max) => `${method}: k phải là số nguyên từ 1 đến ${max}.`],
  [/^Projection complete: (.+)\. You can now apply clustering\.$/, method => `Đã chiếu bằng ${method}. Bạn có thể áp dụng phân cụm.`],
  [/^Finished (.+)\. Select a cluster to explore\.$/, method => `Đã hoàn thành ${method}. Chọn cụm để khám phá.`],
  [/^Imported (.+) \((\d+) rows\)\.$/, (name, count) => `Đã nhập ${name} (${count} dòng).`],
  [/^Renamed dataset to "(.+)"\.$/, name => `Đã đổi tên tập dữ liệu thành “${name}”.`],
  [/^Exported (\w+) for all (\d+) result points\.$/, (format, count) => `Đã xuất ${format} cho toàn bộ ${count} điểm kết quả.`],
  [/^Could not (rename dataset|delete dataset|open CSV|save experiment|export|capture PNG|clear cache): (.+)$/, (action, cause) => {
    const labels: Record<string, string> = { 'rename dataset': 'đổi tên tập dữ liệu', 'delete dataset': 'xóa tập dữ liệu', 'open CSV': 'mở CSV', 'save experiment': 'lưu thí nghiệm', export: 'xuất dữ liệu', 'capture PNG': 'chụp PNG', 'clear cache': 'xóa bộ nhớ đệm' };
    return `Không thể ${labels[action]}. ${translateText(cause, 'vi')}`;
  }],
  [/^Connection check failed: (.+)$/, cause => `Kiểm tra kết nối thất bại. ${translateText(cause, 'vi')}`],
  [/^Column (.+) has no valid numeric values\.$/, name => `Cột ${name} không có giá trị số hợp lệ.`],
  [/^Found only (\d+) valid numeric features\. At least (\d+) numeric columns are needed\. Check the delimiter, header, and column values\.$/, (found, needed) => `Chỉ tìm thấy ${found} đặc trưng số hợp lệ. Cần ít nhất ${needed} cột số. Kiểm tra dấu phân cách, tiêu đề và giá trị cột.`],
  [/^Association · (\w+) · (\d+) matching rows$/, (scope, count) => `Luật kết hợp · ${translateText(scope, 'vi')} · ${count} dòng khớp`],
  [/^(PCA|t-SNE|UMAP) projection$/, method => `Phép chiếu ${method}`],
  [/^(?:3D PROJECTION) \((.+)\)$/, method => `PHÉP CHIẾU 3D (${method})`],
  [/^(\w+): (.+) → (.+)$/, (label, before, after) => `${translateText(label, 'vi')}: ${translateText(before, 'vi')} → ${translateText(after, 'vi')}`],
  [/^(PCA|t-SNE|UMAP) \/ (.+) \/ (.+)$/, (method, clustering, normalization) => `${method} / ${translateText(clustering, 'vi')} / ${translateText(normalization, 'vi')}`],
];

/** Translate UI labels only. Dataset values, links and algorithm identifiers stay as supplied. */
export function translateText(english: string, language: WelcomeLanguage): string {
  if (language !== 'vi') return english;
  const key = english.trim();
  const translation = Object.hasOwn(vietnamese, key) ? vietnamese[key] : undefined;
  if (translation) return english.replace(key, () => translation);
  for (const [pattern, render] of messagePatterns) {
    const match = pattern.exec(key);
    if (match) return english.replace(key, () => render(...match.slice(1)));
  }
  return english;
}
