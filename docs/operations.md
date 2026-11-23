# Vận hành Dimension Lab

## Môi trường và triển khai

| Môi trường | Dữ liệu | Xác thực |
|---|---|---|
| Local demo | RAM và bộ mẫu đi kèm repo | Tài khoản demo |
| CI | Demo và MongoDB tạm trên runner | Tài khoản kiểm thử được tạo theo từng lần chạy |
| Staging | Database, tài khoản dịch vụ và quyền truy cập riêng | Google OAuth client và cấu hình gửi mã riêng |
| Production | Database người dùng và bản sao lưu riêng | OAuth, gửi mã và bí mật riêng |

Với Web Service tạo thủ công trên Render, dùng `npm ci --include=dev && npm run build` để build và `node --import tsx backend/src/index.ts` để start. Đặt Health Check Path là `/api/health`, `LAB_BIND_HOST=0.0.0.0`, `LAB_STORAGE_MODE=atlas` và cấu hình MongoDB đúng môi trường. Với Blueprint, các giá trị tương ứng có trong `render.yaml`. Khi đổi từ bản cũ chưa có quota, tạm dừng lượt ghi trong thời gian chuyển phiên bản để chỉ một thế hệ code cùng ghi vào database. [Render health checks](https://render.com/docs/health-checks)

Đặt `LAB_ALLOWED_ORIGIN` bằng origin HTTPS chính xác. Callback OAuth dùng `/api/auth/google/callback` trên cùng origin. Giữ giá trị bí mật trong **Environment** của Render và giới hạn quyền truy cập cài đặt. Nếu staging chỉ dành cho nhóm thử nghiệm, đặt `LAB_ALLOWED_EMAILS` thành danh sách email cách nhau bằng dấu phẩy. Danh sách áp dụng cho Google, mật khẩu và cả phiên đã đăng nhập. Khi dùng HTTPS ổn định, đặt `LAB_ENABLE_HSTS=1`. CSP hiện chạy ở chế độ report-only để nhóm có thể xem vi phạm trong DevTools và kiểm tra cả báo cáo HTML nhúng trước khi áp dụng CSP chặn nội dung.

## Duyệt trước khi merge và deploy

1. Chủ repo mở một PR để GitHub ghi nhận hai check `Lint, build and test` và `Browser tests with MongoDB`. Sau đó vào **Settings → Rules → Rulesets**, chọn `main`, bật **Require a pull request before merging** và yêu cầu cả hai check qua. Bật Dependabot alerts và security updates trong phần bảo mật của repo. File `.github/dependabot.yml` quản lý lịch kiểm tra phiên bản npm và GitHub Actions. [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) · [Dependabot security updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates)
2. Tạo environment `staging` trên GitHub và đặt biến `LAB_STAGING_URL` bằng origin staging. Sau khi deploy staging, chạy workflow **Staging smoke check** trong Actions. Workflow gọi `/api/health`, kiểm tra mã HTTP và lưu thời gian phản hồi cùng request ID.
3. Dùng trình duyệt thử hai đường đăng nhập trên staging. Với Google, thử một tài khoản được phép và một tài khoản ngoài danh sách. Với email, làm trọn luồng nhập mật khẩu, nhận mã, thử mã sai, xác minh mã đúng và đăng nhập lại. Dùng hai tài khoản riêng kiểm tra bạn A không nhìn thấy CSV hoặc lịch sử của bạn B. Tải CSV lên, chạy PCA và K-Means, xuất dashboard, tải lại CSV thật và đăng xuất. Sau đó xác nhận route Workspace yêu cầu đăng nhập lại. Dùng email thử nghiệm thuộc quyền quản lý của nhóm.
4. Ghi lại commit đã kiểm tra và kết quả smoke trước khi đưa lên production. Render gửi `SIGTERM` khi dừng bản cũ. Server ngừng nhận kết nối mới, đợi request đang chạy rồi đóng MongoDB, với trần 25 giây. [Render deploys](https://render.com/docs/deploys#graceful-shutdown)

## Hạn mức và kết quả API

| Cài đặt mặc định | Phạm vi | Khi chạm ngưỡng |
|---|---|---|
| 5 MiB mỗi CSV | Mỗi lần tải lên | `413` |
| 20 CSV và 30 MiB | Tệp gốc và chỗ đang giữ theo tài khoản Atlas | `409 DATASET_QUOTA_EXCEEDED` |
| 30 lượt tải lên/phút và 30 lượt chạy phân tích/phút | Hai nhóm đếm riêng theo tài khoản trên từng tiến trình | `429 RATE_LIMITED` kèm `Retry-After` |
| 2 tải lên và 2 phân tích đồng thời | Hai nhóm thực thi trên từng tiến trình | `429 WORKLOAD_BUSY` kèm `Retry-After` |

Biến cấu hình có trong `.env.example`. Hai giới hạn workload tự bật trên production. Có thể đặt `LAB_LIMITS_ENABLED=1` để bật khi kiểm thử cục bộ. Quota là nguyên tử trong MongoDB. Rate limit và giới hạn đồng thời là theo tiến trình, vì vậy khi tăng số instance cần tính lại tải tổng hoặc triển khai bộ đếm dùng chung. Datasets hiển thị byte của CSV gốc. Dung lượng Atlas còn gồm GridFS, index, cache, lịch sử và dữ liệu đã xóa mềm đang chờ dọn.

## Đo hiệu năng

Chạy k6 cục bộ qua `node tests/performance/run-local-profiles.mjs`. Biến `K6_PROFILES` chấp nhận danh sách profile phân cách bằng dấu phẩy. Runner local tiếp tục ghi Markdown và dừng ở mức CPU 73% hoặc RAM 74% để chừa biên dưới 75%.

Trên **staging riêng**, tạo sẵn tài khoản đăng nhập bằng mật khẩu đã xác minh. Nạp `STAGING_ACCOUNTS_JSON` từ nơi lưu bí mật của nhóm vào môi trường chạy, dạng mảng đối tượng `email` và `password`. Tránh ghi mảng vào lệnh lưu lịch sử, Git hoặc báo cáo. Mỗi VU đăng nhập bằng một tài khoản riêng. Bắt đầu từ một hành trình trước khi tăng tải.

```powershell
$env:LAB_K6_STAGING = '1'
$env:BASE_URL = 'https://ten-staging.onrender.com'
$env:PROFILE = 'smoke'
k6 run tests/performance/user-journey.js
```

| Profile | VU tối đa | Mục đích |
|---|---:|---|
| `smoke` | 1 | Xác nhận một hành trình tải lên, phân tích và tải xuống |
| `load-lite` | 2 | Mốc tải nhẹ ban đầu |
| `load` | 4 | Tải tăng dần trong 75 giây |
| `stress` | 8 | Tăng đến khi thấy `429`, lỗi hoặc độ trễ tăng |
| `spike` | 4 | Tăng người dùng đột ngột rồi quan sát phục hồi |
| `soak` | 1 | Kiểm tra ổn định trong 5 phút. Có thể lặp trong cửa sổ theo dõi riêng |

Staging dùng mẫu Wheat Seeds, chạy PCA và K-Means, tải lại CSV rồi xóa mềm dữ liệu thử. Xem tỷ lệ hoàn thành, HTTP lỗi, p95 tổng và p95 từng bước đăng nhập, upload, compute và download. Theo dõi CPU và RAM **trên máy chủ Render** và dung lượng Atlas khi chạy từ máy cá nhân rồi dừng nếu tiến gần 75% ở CPU/RAM. Xem `429` cùng `Retry-After` để biết lớp giới hạn đang hoạt động. Tách ảnh hưởng của cold start và kiểm tra số liệu từng profile trước khi dùng kết quả để ước lượng công suất. [Grafana k6 metrics](https://grafana.com/docs/k6/latest/using-k6/metrics/)

Đo render 3D riêng bằng Chromium. Báo cáo đính kèm thời gian từ click đến khi PCA hoàn thành, FPS trung bình và p95 của khoảng cách giữa các frame trong lúc kéo biểu đồ. So sánh các lần chạy trên cùng máy, cùng trình duyệt và cùng chế độ GPU.

```powershell
$env:LAB_E2E_BROWSER_PERF = '1'
npm.cmd run test:e2e -- browser-performance.spec.ts
```

## Giám sát và ứng phó

- Dùng `/api/health` cho giám sát công khai và tài khoản admin cho chi tiết `/api/system-health`. Trong Render, bật thông báo triển khai lỗi và thiết lập theo dõi uptime cho `/api/health`. Trong Atlas bật cảnh báo dung lượng theo chỉ số có sẵn của gói, với mốc xem xét 70% và 85% dung lượng. [Render notifications](https://render.com/docs/notifications) · [Atlas alerts](https://www.mongodb.com/docs/atlas/configure-alerts/)
- Dùng log JSON `api.request` và `X-Request-Id` để đối chiếu báo cáo người dùng. Theo dõi `5xx`, p95 và `429` theo route. Mốc ban đầu để điều tra là `5xx ≥ 1%` với ít nhất 100 request trong 5 phút hoặc p95 API vượt 3 giây liên tục trong 5 phút. Các mốc này dùng để bắt đầu quan sát và hiệu chỉnh bằng số liệu staging.
- Khi deploy gây lỗi, mở **Deploys**, chọn bản khỏe gần nhất còn artifact và bấm **Rollback**. Render tắt auto-deploy sau khi rollback từ Dashboard. Chạy lại smoke trước khi bật auto-deploy. Nếu bản rollback có trước quota, giữ hệ thống ở chế độ ngừng ghi cho đến khi có phiên bản tương thích ledger. [Render rollbacks](https://render.com/docs/rollbacks)

## Sao lưu và phục hồi

Ưu tiên snapshot theo gói Atlas nếu đã được nhóm duyệt. Với database nhỏ có thể dùng MongoDB Database Tools để tạo `mongodump` trong cửa sổ tạm ngừng ghi. Xuất cả database để giữ liên kết giữa metadata, phiên bản và hai collection GridFS, rồi mã hóa bản sao và lưu ở nơi có quyền truy cập hạn chế. Giữ file cấu hình kết nối ngoài repo và dùng một database trống riêng để diễn tập phục hồi. [Atlas backup và restore](https://www.mongodb.com/docs/atlas/backup-restore-cluster/) · [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/)

```powershell
mongodump --config '<đường-dẫn-riêng>/backup-source.yml' --db '<db-nguồn>' --archive='<đường-dẫn-riêng>/dimension-lab.archive.gz' --gzip
mongorestore --config '<đường-dẫn-riêng>/restore-target.yml' --archive='<đường-dẫn-riêng>/dimension-lab.archive.gz' --gzip --nsInclude '<db-nguồn>.*' --nsFrom '<db-nguồn>.*' --nsTo '<db-phục-hồi>.*' --nsExclude '<db-nguồn>.sessions' --nsExclude '<db-nguồn>.oauth_attempts' --nsExclude '<db-nguồn>.email_enrollments'
```

Bản phục hồi bỏ các phiên và mã đăng nhập tạm để người dùng đăng nhập mới. So sánh số bản ghi, mở thử dữ liệu với một tài khoản được phép, tải lại CSV và so hash với bản trước backup. Kiểm tra tài khoản khác vẫn bị từ chối và mở được một phân tích sau phục hồi. Ghi thời gian backup gần nhất, thời gian phục hồi và commit ứng dụng đã xác minh trước khi chuyển lưu lượng.

## Dọn GridFS

Xóa CSV trên giao diện thu hồi quyền truy cập và trả quota. Tệp vật lý được giữ trong thời hạn mặc định 7 ngày. Maintenance chỉ xét tombstone và chỗ giữ quá hạn có định danh tệp, đồng thời kiểm tra tham chiếu trước khi dọn. Tệp cũ không có đủ metadata cần kiểm kê thủ công.

Thiết lập `LAB_MAINTENANCE_URI` và `LAB_MAINTENANCE_DATABASE` riêng cho đích cần bảo trì. Chạy `npm.cmd run maintenance:datasets` để xem trước. Xem `trash`, `orphanReservations`, `skipped` và `fileBytes` trong đầu ra. Mỗi lượt xử lý tối đa 100 tombstone và 100 ledger có giữ chỗ cũ. Để áp dụng, trước tiên xác minh bản sao lưu và dừng mọi ghi vào database đích. Sau đó đặt `LAB_MAINTENANCE_WRITES_PAUSED=1` và chạy `npm.cmd run maintenance:datasets -- --execute`. Sau khi xác minh kết quả, bỏ biến xác nhận và mở lại lượt ghi. Với staging, duy trì dữ liệu test riêng để có thể lặp lại quy trình trước khi bảo trì production.
