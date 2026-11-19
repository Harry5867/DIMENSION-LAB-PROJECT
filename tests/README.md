# Hướng dẫn kiểm thử Dimension Lab

> Tài liệu này mô tả các tầng kiểm thử hiện có trong thư mục `tests/`, lệnh chạy trên Windows PowerShell, các chỉ số cần đọc và giới hạn của từng loại test. Hãy chạy lệnh từ thư mục gốc dự án (`D:\Dimension-Lab=ver2`).

## 1. Các tầng kiểm thử

| Tầng | Lệnh chính | Kiểm tra gì? | Có chạy dịch vụ thật không? |
|---|---|---|---|
| Unit/regression | `npm test` | Hàm xử lý dữ liệu, thuật toán, logic giao diện, lưu trữ và các lỗi hồi quy. | Không; dùng fixture, mock và dữ liệu nhỏ. |
| API integration | `npm run test:api` | Hợp đồng HTTP, xác thực, phân quyền, CSV CRUD, tính toán và lỗi khởi động Atlas. | Có bật Express cục bộ; không kết nối MongoDB Atlas thật. |
| End-to-end (E2E) | `npm run test:e2e` | Các luồng người dùng thật trên Chromium: Welcome, Workspace, dataset, phân tích và xuất kết quả. | Có; tự bật frontend và API demo cục bộ. |
| Performance (k6) | Xem [mục 5](#5-kiểm-thử-hiệu-năng-với-k6) | Thời gian phản hồi, lỗi và tải đồng thời ở API. | Tuỳ script: localhost demo hoặc health endpoint Render. |
| Lint/build | `npm run lint`, `npm run build` | Quy tắc mã nguồn, kiểu TypeScript và đóng gói frontend. | Không. |

Các tầng này bổ sung cho nhau: unit test kiểm tra các phần nhỏ, integration kiểm tra API qua HTTP, E2E kiểm tra hành vi trong trình duyệt, còn k6 tạo tải lên endpoint/API. k6 hiện không đo độ mượt hình ảnh hoặc thời gian render giao diện trong trình duyệt.

## 2. Chuẩn bị

Mở PowerShell và vào thư mục dự án:

```powershell
cd "D:\Dimension-Lab=ver2"
Get-Location
```

`Get-Location` cần hiển thị `D:\Dimension-Lab=ver2`. Cài dependency nếu đây là lần đầu hoặc vừa cập nhật source:

```powershell
npm ci
```

E2E cần Chromium. Cài trình duyệt headless một lần:

```powershell
npx playwright install chromium --only-shell
```

Để xem cửa sổ Chromium khi chạy thay vì chế độ headless:

```powershell
npx playwright install chromium
```

k6 là chương trình riêng, không được cài cùng npm. Kiểm tra đã cài và có trong PATH:

```powershell
k6 version
```

Nếu Windows vừa cài k6 nhưng chưa nhận lệnh, đóng và mở lại PowerShell rồi chạy `k6 version` lần nữa.

Các bài unit, API và E2E cục bộ dùng dữ liệu/tài khoản demo do cấu hình test tạo ra. Không cần đặt thông tin đăng nhập production hay Google OAuth vào `.env` để chạy chúng.

## 3. Lệnh kiểm tra thông thường

Có thể chạy theo thứ tự sau sau mỗi thay đổi lớn:

```powershell
npm run lint
npm test
npm run test:api
npm run test:e2e
npm run build
```

Mỗi lệnh kết thúc với mã 0 khi thành công. Chạy một unit test riêng để khoanh vùng lỗi:

```powershell
node --import tsx --test tests/unit/exploration.test.ts
```

Các script tương ứng trong `package.json`:

- `npm test` chạy các file `tests/unit/*.test.ts` bằng Node Test Runner.
- `npm run test:api` chạy `tests/integration/system-api.integration.ts`.
- `npm run test:e2e` chạy Playwright theo `playwright.config.ts`.
- `npm run lint` chạy ESLint trên workspace.
- `npm run build` chạy kiểm tra TypeScript (`tsc`) rồi build Vite.

## 4. Unit, API và E2E bao phủ những gì?

### 4.1 Unit và regression — `tests/unit/`

Đây là các bài chạy nhanh trên logic và dữ liệu nhỏ, không mở trình duyệt:

| File/nhóm | Phạm vi chính |
|---|---|
| `exploration.test.ts`, `unsupervised.test.ts`, `system-regressions.test.ts` | PCA/UMAP/t-SNE, K-Means, DBSCAN, GMM, Isolation Forest, Apriori; kiểm tra tham số, giá trị hữu hạn, thứ tự/định danh hàng, metric phân cụm và các trường hợp biên. |
| `ux.test.ts` | Đọc/ghi CSV, giữ nguyên ID và giá trị thiếu, xuất CSV/JSON, lịch sử kết quả, huỷ request và đăng nhập demo. |
| `storage-regression.test.ts` | Mock MongoDB/GridFS để kiểm tra cô lập dữ liệu theo chủ sở hữu, session, OAuth và xử lý lỗi ghi. Không truy cập Atlas thật. |
| `terrain.test.ts` | Grid địa hình, giá trị NoData, smoothing, hình học cầu, picking, thay LOD và fallback Canvas. |
| `dataMorph.test.ts`, `plotCloud.test.ts` | Nội suy điểm 3D, giữ identity của điểm, responsive, reduced motion, hủy animation và quản lý vòng lặp render. |
| `portal.test.ts` | Điều hướng, intro, theme, Stories, About, carousel, chuyển động, ngân sách hạt và ví dụ thuật toán trong portal. |
| `stories.test.ts` | Nội dung/nguồn ảnh, lọc topic, gom cụm marker địa lý, ngày đổi tuyến và giới hạn hiển thị trên mobile. |

### 4.2 API integration — `tests/integration/`

Chạy:

```powershell
npm run test:api
```

Bài test bật Express tạm trên `127.0.0.1:5318` và `127.0.0.1:5319` (có thể đổi bằng `LAB_TEST_PORT`). Nó kiểm tra session, role, demo data, upload/list/read/rename/delete/download CSV, hợp đồng endpoint compute, và trường hợp Atlas không khởi động. MongoDB được trỏ tới địa chỉ localhost không hoạt động để xác nhận lỗi được trả về đúng cách; bài này không cần Atlas chạy.

Nếu cổng mặc định đang được dùng, chọn cổng khác trong PowerShell trước khi chạy:

```powershell
$env:LAB_TEST_PORT = "5418"
npm run test:api
Remove-Item Env:LAB_TEST_PORT
```

### 4.3 End-to-end — `tests/e2e/`

Chạy:

```powershell
npm run test:e2e
```

Playwright tự bật API demo tại `127.0.0.1:5000` và Vite tại `127.0.0.1:3000`. Nếu hai cổng này đang được dùng, đặt cổng riêng trong PowerShell; Vite proxy sẽ tự trỏ đến API tương ứng:

```powershell
$env:LAB_E2E_API_PORT = "5128"
$env:LAB_E2E_WEB_PORT = "3128"
npm run test:e2e
Remove-Item Env:LAB_E2E_API_PORT, Env:LAB_E2E_WEB_PORT
```

E2E chạy một worker Chromium để giữ thứ tự ổn định.

Các luồng được kiểm tra:

- **Welcome:** intro, theme sáng/tối, tìm thành phố trên Atlas, chuyển Terrain và thay đổi độ cao, lọc/mở Stories.
- **Workspace và portal:** đăng nhập demo, từ chối mật khẩu sai, khôi phục session, sign out, Theory, User Guide, dataset mẫu, tải CSV nguồn và mở hồ sơ About Us.
- **Quản lý dataset:** import CSV, xem trước 20 dòng, tìm dữ liệu thô, tải bản CSV gốc, đổi tên, xóa và từ chối CSV thiếu feature số hợp lệ.
- **Phân tích:** UMAP + DBSCAN, t-SNE + GMM, PCA + K-Means; điều khiển view 3D/fullscreen; export point data CSV; lưu/khôi phục experiment; Isolation Forest; Apriori và xem thành phần luật.

Chạy có giao diện hoặc mở Playwright UI:

```powershell
npm run test:e2e -- --headed
npm run test:e2e -- --ui
```

Khi bài thất bại, cấu hình lưu trace trong `test-results/`. Mở trace bằng:

```powershell
npx playwright show-trace <duong-dan-den-trace.zip>
```

E2E đăng nhập bằng tài khoản demo, không xác minh Google OAuth production hoặc lưu dữ liệu trên Atlas thật. Các luồng ấy cần được nghiệm thu riêng trên staging với tài khoản/dữ liệu thử.

## 5. Kiểm thử hiệu năng với k6

### 5.1 Bài user journey cục bộ — khuyến nghị để bắt đầu

Script [user-journey.js](performance/user-journey.js) thực hiện một chu trình API cho mỗi virtual user:

1. Đăng nhập tài khoản demo.
2. Liệt kê dataset.
3. Upload fixture CSV `fixtures/round2-demo.csv` (32 dòng).
4. Đọc dataset vừa upload.
5. Gửi ma trận vào API chạy PCA và xác nhận kết quả không lấy từ cache.
6. Tải CSV gốc.
7. Xóa dataset thử và đăng xuất.

Mỗi chu trình gửi 8 HTTP request chính; các `checks` kiểm tra riêng cả mã trạng thái và cache. Storage chạy ở chế độ demo trong bộ nhớ, không dùng MongoDB. Mỗi dataset được xóa trong `finally`; runner tắt backend khi kết thúc hoặc khi profile bị dừng theo resource guard. Luồng này không kiểm tra render trên browser, clustering phía client hay thao tác export kết quả trong UI.

Runner [run-local-profiles.mjs](performance/run-local-profiles.mjs) tự bật API demo tại `127.0.0.1:5103`, chỉ bind loopback, rồi chạy k6. Không chạy `npm run dev:all` cho bài này. Trong PowerShell từ root dự án, chạy **mỗi profile riêng**:

```powershell
$env:K6_PROFILES = "load"
node .\tests\performance\run-local-profiles.mjs
```

Đợi lệnh kết thúc và in kết quả rồi đổi `load` thành `load-lite`, `spike`, `stress` hoặc `soak`:

Nếu CPU thường chạm resource guard khi chạy `load` (tối đa 4 VU), thử `load-lite`. Bài này giữ nguyên các bước API và thời lượng khoảng 75 giây, nhưng chỉ tăng từ 1 lên tối đa 2 VU:

```powershell
$env:K6_PROFILES = "load-lite"
node .\tests\performance\run-local-profiles.mjs
```

```powershell
$env:K6_PROFILES = "spike"
node .\tests\performance\run-local-profiles.mjs
```

```powershell
$env:K6_PROFILES = "stress"
node .\tests\performance\run-local-profiles.mjs
```

```powershell
$env:K6_PROFILES = "soak"
node .\tests\performance\run-local-profiles.mjs
```

Profile mặc định của runner là cả bốn bài lần lượt. Chạy từng bài giúp quan sát tài nguyên và tránh bắt đầu bài kế tiếp ngay sau một bài tải nặng.

| Profile | Tải mô phỏng trong script | Thời lượng gần đúng | Mục đích |
|---|---|---:|---|
| `load-lite` | Ramping VUs: 1 → 2 rồi về 0. | 75 giây | Bản tải nhẹ cho máy cá nhân; vẫn chạy đủ user journey nhưng tối đa 2 phiên. |
| `load` | Ramping VUs: 1 → 2 → 4 rồi về 0. | 75 giây | Tải tăng từ từ tới mức dự kiến. |
| `stress` | 1 → 2 → 4 → 6 → 8 VUs rồi về 0. | 90 giây | Tìm điểm bắt đầu chậm/lỗi; có thể chạm resource guard trước khi hoàn tất. |
| `spike` | Giữ 1 VU, tăng nhanh lên 4, giữ ngắn rồi giảm về 1 và 0. | 74 giây | Quan sát phản ứng với đợt tăng tải đột ngột. |
| `soak` | 1 VU chạy liên tục. | 5 phút | Kiểm tra ngắn về tính ổn định theo thời gian; chưa đủ dài để kết luận rò rỉ bộ nhớ lâu hạn. |

Runner hiện dừng bài khi CPU hệ thống đạt 73% hoặc RAM hệ thống đạt 74%, lấy mẫu khoảng mỗi 250 ms. Đây là **bộ giám sát best-effort**, không phải giới hạn cứng của Windows; tác vụ khác hoặc một spike đột ngột có thể khiến số đo vượt ngưỡng trước khi tiến trình k6 kịp dừng. Máy cần đủ rảnh trước khi bắt đầu. Nếu runner báo CPU/RAM đã cao, hãy đợi máy ổn định rồi mới thử lại; đừng xóa hoặc thay đổi dữ liệu hệ thống để cố chạy.

Sau mỗi lần chạy profile, runner tự thêm một hàng vào [TEST-REPORT.md](performance/TEST-REPORT.md) với thời gian, trạng thái, ngưỡng CPU/RAM đang dùng, iterations, HTTP requests, checks, success/error rate, p95 và CPU/RAM start/max. Runner lưu metric JSON dạng luồng trong lúc k6 chạy và dùng summary cuối khi có. Nếu process bị resource guard dừng trước summary, runner tổng hợp các điểm đã ghi; p95 khi dùng luồng là ước lượng nearest-rank và chỉ mô tả phần thời gian đã chạy. File JSON tạm trong thư mục temp Windows được xóa sau khi ghi Markdown. Mỗi lần chạy profile riêng sẽ thêm một hàng lịch sử mới.

Tự động ghi báo cáo hiện áp dụng cho bốn profile mặc định (`load`, `stress`, `spike`, `soak`) cùng `load-lite` khi chọn chạy, tất cả qua `run-local-profiles.mjs`. Các lệnh `npm test`, `npm run test:api`, `npm run test:e2e` và hai script k6 độc lập `api-load.js`/`render-health-load.js` chưa ghi vào bảng này.

Ngưỡng chất lượng trong `user-journey.js`:

- `journey_success > 95%`: ít nhất 95% chu trình đăng nhập → thao tác dataset → PCA → tải CSV → dọn dữ liệu → logout hoàn tất.
- `http_req_failed < 5%`: tỷ lệ HTTP request lỗi dưới 5%; dừng sớm nếu tỷ lệ vượt ngưỡng đủ lâu.
- `http_req_duration p(95) < 3000 ms`: p95 thời gian phản hồi từng HTTP request dưới 3 giây.
- `dropped_iterations = 0`: k6 không bị thiếu virtual user để bắt đầu lượt đã lên lịch.

#### Kết quả ghi nhận gần nhất trên máy cá nhân

Đây là kết quả của các lần chạy trước bằng backend demo và fixture 32 dòng; dùng để minh hoạ cách ghi báo cáo, không phải cam kết tải của Render. Cấu hình resource guard đã được điều chỉnh sau một số lượt chạy, nên khi so sánh hãy ghi cả ngưỡng và phiên bản script.

| Bài | Kết quả | Trạng thái |
|---|---|---|
| Load | 4 VU tối đa; 127 workflow, 1.016 HTTP request, 0% lỗi; HTTP p95 3,76 ms; CPU tối đa 65%, RAM 70%. | Hoàn tất. |
| Spike | 4 VU tối đa; 154 workflow, 1.232 HTTP request, 0% lỗi; HTTP p95 3,78 ms, workflow p95 27 ms; CPU tối đa 64%, RAM 67%. | Hoàn tất. |
| Stress | Đã ramp lên tới 8 VU; runner dừng khi CPU đo được 81%, RAM 67%. Không có tổng kết k6 hoàn chỉnh. | Dừng bởi resource guard; chưa kết luận giới hạn. |
| Soak | Lượt 2 VU dừng khi CPU đo được 93%, RAM 66%; lượt thử lại 1 VU dừng khi CPU 56%, RAM 66% với guard lúc đó là 55%. | Không hoàn tất đủ 5 phút. |

Lượt soak đầu ghi nhận CPU vượt mốc 75% trước khi runner dừng k6. CPU/RAM của runner là số đo toàn máy và guard chỉ có thể phản ứng sau khi lấy mẫu; nó không phải giới hạn phần cứng cứng. Vì vậy hãy chạy khi máy ít tác vụ nền và ghi lại mọi lần dừng sớm thay vì xem chúng như kết quả thành công.

### 5.2 API dataset-read — `api-load.js`

Đây là bài tải endpoint cũ, chỉ đọc `GET /api/datasets?limit=20`; nó đăng nhập một lần trong `setup` rồi dùng token cho các lượt đọc. Tốc độ tăng từ 5 lên 80 iteration/giây trong khoảng 6 phút 15 giây, tối đa 100 VU. Vì mỗi iteration hiện gọi một GET, iteration/giây xấp xỉ request/giây trong bài này.

Ngưỡng: `p(95) < 800 ms`, HTTP error rate `< 1%`, `dropped_iterations = 0`. **Script này không có resource guard CPU/RAM**; không nên dùng bài 80 iteration/giây trên máy cá nhân nếu cần giữ CPU/RAM dưới giới hạn đã đặt.

Để chạy, bật API demo trong PowerShell thứ nhất:

```powershell
cd "D:\Dimension-Lab=ver2"
$env:NODE_ENV = "test"
$env:PORT = "5000"
$env:LAB_BIND_HOST = "127.0.0.1"
$env:LAB_STORAGE_MODE = "demo"
$env:LAB_AUTH_EMAIL = "demo@dimension.lab"
$env:LAB_AUTH_PASSWORD = "Dimension123!"
npm run server
```

Trong PowerShell thứ hai:

```powershell
cd "D:\Dimension-Lab=ver2"
k6 run .\tests\performance\api-load.js
```

Dừng API bằng `Ctrl+C` trong cửa sổ thứ nhất sau khi k6 kết thúc.

### 5.3 Health check Render — `render-health-load.js`

Mặc định script gọi `https://dimension-lab-project.onrender.com/api/health`, tăng arrival rate từ 1 lên 5 iteration/giây trong khoảng 100 giây. Nó kiểm tra HTTP 200 và `data.status === "ok"` (service/Atlas healthy). Ngưỡng là `p(95) < 2000 ms`, HTTP error rate `< 1%`, `dropped_iterations = 0`.

```powershell
k6 run .\tests\performance\render-health-load.js
```

Đổi host nếu cần:

```powershell
$env:BASE_URL = "https://<ten-service>.onrender.com"
k6 run .\tests\performance\render-health-load.js
Remove-Item Env:BASE_URL
```

Bài này chỉ gọi health endpoint, không mô phỏng đăng nhập, upload hay phân tích. Dịch vụ Render free có thể ngủ và cần cold start; một lần health test thất bại do cold start không tự động chứng minh ứng dụng lỗi. Dù chỉ đọc health, đây vẫn là traffic gửi tới dịch vụ deploy; hãy chạy có kiểm soát và ưu tiên staging.

## 6. Cách đọc kết quả k6

| Chỉ số | Ý nghĩa và cách đọc |
|---|---|
| `http_reqs` | Tổng số HTTP request và tốc độ request/giây. Chỉ số này phụ thuộc số endpoint mỗi iteration gọi. |
| `http_req_duration` | Thời gian phản hồi HTTP. `avg` là trung bình; `med` là trung vị; `p(90)`/`p(95)` là ngưỡng mà 90%/95% request hoàn thành không lâu hơn; `max` là request chậm nhất. Hãy xem p95 cùng lỗi, không chỉ xem trung bình. |
| `http_req_failed` | Tỷ lệ HTTP request được k6 phân loại là lỗi. Đọc cùng các `checks` để biết endpoint/luồng nào thất bại. |
| `checks_total`, `checks_succeeded`, `checks_failed` | Tổng xác nhận nghiệp vụ và số lần đạt/trượt. Một check là điều kiện, không nhất thiết là một request riêng. |
| `journey_success` | Tỷ lệ chu trình k6 hoàn tất đầy đủ, gồm cleanup/logout, trong `user-journey.js`. |
| `journey_duration` | Thời gian toàn chu trình API; khác với latency của một request. |
| `iterations` | Số lượt của kịch bản đã thực hiện; trong `user-journey.js`, một iteration là một chu trình user journey. |
| `vus` / `vus_max` | Số virtual user đang hoạt động / mức tối đa trong kịch bản. VU không đồng nghĩa trực tiếp với một người thật hay một request/giây. |
| `dropped_iterations` | Số lượt không bắt đầu đúng thời điểm vì k6 không cấp đủ VU. Giá trị khác 0 cho thấy generator không đạt tốc độ lên lịch. |
| `data_received` / `data_sent` | Dữ liệu mạng nhận/gửi trong lúc k6 chạy; không phải bộ nhớ RAM của server. |
| Runner `[RESOURCE]` | Mức CPU/RAM toàn máy quan sát được trong khi profile chạy; không phải số đo riêng tiến trình backend. |

Ngưỡng đạt trong file k6 có nghĩa là kịch bản đã đạt **các điều kiện được đặt trong script**, không phải chứng nhận rằng hệ thống không thể lỗi ở tải cao hơn.

## 7. Cách diễn giải và giới hạn

- Kết quả của `run-local-profiles.mjs` đo API demo trên máy cá nhân, dùng CSV 32 dòng và storage trong bộ nhớ. Nó không dự đoán trực tiếp sức chịu tải của Render hoặc MongoDB Atlas.
- Kết quả của `api-load.js` là một endpoint đọc duy nhất, không đại diện cho nhiều user đồng thời thực hiện toàn bộ website.
- Kết quả của `render-health-load.js` chỉ nói về `/api/health`; không chứng minh upload, OAuth, PCA hay database workflow hoạt động dưới cùng tải.
- PCA trong user journey chạy qua API. Phân cụm/hiển thị 3D và một số thao tác export diễn ra phía trình duyệt; k6 API không đo độ mượt hoặc hiệu năng CPU/GPU trình duyệt. Dùng E2E để kiểm tra hành vi, còn muốn benchmark browser cần công cụ browser-load riêng.
- Để đánh giá bản deploy, dùng staging có cấu hình gần production, dữ liệu kích thước đại diện và tài khoản test. Không trỏ bài upload/delete vào dữ liệu người dùng thật. OAuth Google, đăng ký tài khoản và Atlas thật cần nghiệm thu riêng bằng cấu hình an toàn.
- `p(95)` nhỏ trong một lần chạy không cho biết số user tối đa. Muốn tìm giới hạn phải tăng tải từ từ, lặp lại, theo dõi API/database/CPU/RAM, đồng thời ghi nhận điểm bắt đầu có lỗi hoặc độ trễ vượt mục tiêu.

## 8. Xử lý lỗi thường gặp

### `Cannot find module ...run-local-profiles.mjs`

PowerShell đang ở thư mục khác. Chạy `cd "D:\Dimension-Lab=ver2"`, xác nhận `Get-Location`, rồi chạy lại lệnh.

### `k6` is not recognized

Kiểm tra `k6 version`. Nếu vừa cài bằng winget, mở cửa sổ PowerShell mới để cập nhật PATH.

### Chromium executable không tìm thấy

Chạy `npx playwright install chromium --only-shell`, sau đó chạy lại E2E.

### Cổng 3000, 5000, 5318/5319 hoặc 5103 đang được dùng

Đóng server dev/test cũ rồi chạy lại. E2E tự mở cổng 3000/5000; API integration mặc định dùng 5318/5319; k6 runner dùng 5103. Đừng chạy đồng thời nhiều runner cùng profile/cổng.

### Runner báo CPU/RAM đã chạm ngưỡng

Runner chưa bắt đầu profile hoặc đã dừng profile theo resource guard. Chờ máy giảm tải rồi thử một profile nhẹ riêng như `load`. Cảnh báo tài nguyên khác với lỗi `check` của ứng dụng.

### Render health check báo lỗi

Kiểm tra URL service, trạng thái deploy, cold start và nội dung `/api/health`. Kết quả health không thay thế kiểm thử nghiệp vụ.

## 9. Tài liệu liên quan

- [Báo cáo kiểm thử hệ thống](../docs/system-verification.md)
- [Luồng dữ liệu](../docs/architecture/data-flow.md)
- [Playwright config](../playwright.config.ts)
- [Kịch bản k6 user journey](performance/user-journey.js)
- [Kịch bản k6 endpoint load](performance/api-load.js)
- [Kịch bản k6 Render health](performance/render-health-load.js)
