# Danh mục API của Dimension Lab

**Trên nhánh `codex/integrate-auth`, backend đăng ký 22 thao tác dưới `/api`.** Các đường dẫn `/api/v1` và `/api/v2` nằm trên nhánh `son`. Bảng dưới ghi theo mã nguồn của hai commit trên GitHub ngày 18/11/2026. Khi tra một bản triển khai, hãy đối chiếu commit của dịch vụ với commit trong bảng.

| Phạm vi | `codex/integrate-auth` | `son` |
| --- | ---: | ---: |
| `/api` không có số phiên bản | 22 | 24 |
| `/api/v1` | 0 | 49 |
| `/api/v2` | 0 | 54 |
| Ngoài `/api` (tài liệu, vận hành) | 2 | 4 |
| **Tổng số cặp phương thức và đường dẫn** | **24** | **131** |

Mỗi cặp phương thức và đường dẫn được tính một lần trên từng nhánh. Ví dụ, `GET /api/datasets` và `POST /api/datasets` là hai thao tác. Swagger UI được tính là một trang tại `/docs/`. Các con số chỉ tính route ứng dụng, tách khỏi tài nguyên tĩnh của giao diện và xử lý `HEAD`/`OPTIONS` tự động của Express/CORS.

Các commit dùng để đối chiếu là [codex/integrate-auth · b2ee0c4](https://github.com/Harry5867/DIMENSION-LAB-PROJECT/tree/b2ee0c460ce282c1023a8e94698633231e636b7d) và [son · c8945ae](https://github.com/Harry5867/DIMENSION-LAB-PROJECT/tree/c8945ae69cbf7444a14b23abf518c973eae3deee).

## 1. API chung của hai nhánh

Bảng này liệt kê toàn bộ 22 thao tác `/api` trên `codex/integrate-auth`. Nhánh `son` đăng ký cả 22 thao tác này tại cùng đường dẫn.

**Quyền truy cập.** “Đăng nhập” gồm `viewer`, `researcher` và `admin`. Demo nhận `Authorization: Bearer <token>`. Atlas dùng cookie HttpOnly `lab_session` và yêu cầu `Origin` phù hợp khi ghi dữ liệu. Backend giới hạn dataset riêng trong Atlas theo tài khoản. Các route đổi tên và xóa chỉ áp dụng cho dataset có thể chỉnh sửa. Hai dataset mẫu `cancer_wdbc` và `wholesale_customers` được bảo vệ.

**Cách đọc phản hồi.** Với JSON thành công, đọc dữ liệu ở `data`. Với JSON lỗi, đọc `error.code` và `error.message`. Cột HTTP ghi mã trả về chính. Các route tải tệp và chuyển hướng ghi rõ định dạng riêng.

### Đăng nhập và phiên làm việc

| Phương thức và đường dẫn | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `GET /api/auth/options` | Công khai | 200 | Đọc `mode`, `google` và `registration` để biết nút đăng nhập nào có thể dùng. |
| `POST /api/auth/register` | Công khai khi bật đăng ký | 201 | Tạo tài khoản từ `email`, `password`, `displayName`. Backend cho đăng ký trong chế độ Atlas ngoài production. Tên hiển thị dài 1–80 ký tự sau khi cắt khoảng trắng. |
| `POST /api/auth/login` | Công khai | 200 | Gửi `email` và `password`. Demo trả `token` và `user`, có thể chọn `role` demo. Atlas xác thực tài khoản và đặt cookie phiên. Với `enroll: true`, nếu chưa có mật khẩu thì gửi mã xác minh và trả 202 kèm `challenge`. |
| `POST /api/auth/verify-email` | Công khai, cùng origin | 200 | Gửi `challenge` và mã 6 chữ số trong 10 phút. Backend tạo mật khẩu và cấp phiên sau khi xác minh. Cần đặt `RESEND_API_KEY` và `LAB_EMAIL_FROM` của người gửi đã xác minh trong môi trường backend. |
| `GET /api/auth/google` | Công khai khi bật Google | 302 | Mở luồng đăng nhập. Trình duyệt được chuyển đến Google. |
| `GET /api/auth/google/callback` | Luồng OAuth của Google | 303 | Xử lý phản hồi của Google. Khi thành công, backend đặt cookie và chuyển về Workspace. Khi xác thực OAuth thất bại, trình duyệt có thể được chuyển về Welcome. |
| `GET /api/auth/me` | Phiên tùy chọn | 200 | Đọc `authenticated` và `user`. Khi chưa đăng nhập, `user` bằng `null`. |
| `POST /api/auth/logout` | Demo cần phiên. Atlas cần Origin hợp lệ | 200 | Thu hồi phiên. Atlas cũng xóa cookie và chấp nhận yêu cầu khi phiên đã hết hạn. Trả `authenticated: false`. |

### Hệ thống

| Phương thức và đường dẫn | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `GET /api/health` | Công khai | 200, 503 | Kiểm tra API và chế độ lưu trữ. Khi chạy Atlas, backend trả `503` nếu kho dữ liệu không sẵn sàng. |
| `GET /api/system-health` | Đăng nhập | 200 | Đọc uptime, bộ nhớ của tiến trình và các thông số lưu trữ. |
| `POST /api/test-db` | Admin | 200 | Kiểm tra kết nối MongoDB. Đọc `data.connected` để biết kết quả. Demo trả `false` vì dùng bộ nhớ. |
| `DELETE /api/cache` | Admin | 200 | Xóa bộ nhớ đệm của phép tính và trả `clearedCount`. |

### Dataset và CSV

| Phương thức và đường dẫn | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `GET /api/datasets` | Đăng nhập | 200 | Liệt kê dataset. Query `offset` mặc định 0, `limit` mặc định 50 và tối đa 100. Có `X-Next-Offset` khi còn trang sau. |
| `POST /api/datasets/upload` | Admin hoặc researcher | 201 | Tạo dataset từ một tệp CSV UTF-8, tối đa 5 MiB. Gửi `multipart/form-data` với trường `file`. Kết quả có `id` của dataset mới. |
| `GET /api/datasets/{id}` | Đăng nhập | 200 | Lấy thông tin dataset và toàn bộ hàng trong `rawRows`. |
| `GET /api/datasets/{id}/preview` | Đăng nhập | 200 | Lấy thông tin dataset và tối đa 20 hàng đầu trong `rows`. |
| `GET /api/datasets/{id}/download` | Đăng nhập | 200 | Tải tệp CSV đính kèm. Với tệp đã tải lên, đây là nội dung gốc. |
| `PATCH /api/datasets/{id}` | Admin hoặc researcher | 200 | Đổi tên qua trường JSON `name` dài 1–200 ký tự. Trả lại thông tin sau khi đổi. |
| `DELETE /api/datasets/{id}` | Demo cần admin. Atlas cho admin hoặc researcher | 200 | Xóa dataset có quyền sửa. Trong Atlas, thao tác áp dụng cho dataset thuộc tài khoản hiện tại. |

### Phân tích và lịch sử thí nghiệm

| Phương thức và đường dẫn | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `POST /api/compute` | Đăng nhập | 200 | Gửi `matrix`, `groundTruth`, `reductionConfig`, `clusteringConfig`. Trả tọa độ, kết quả phân cụm và chỉ số đánh giá. Header `X-Cache` cho biết `HIT` hoặc `MISS`. |
| `POST /api/unsupervised` | Đăng nhập | 200 | Gửi `kind`, `rows`, `features`, `options`. `anomaly` dùng Isolation Forest và thêm `normalization`. `association` dùng Apriori. Trả kết quả ngay. |
| GET /api/unsupervised/history | Phiên Atlas | 200 | Đọc tối đa 5 lượt đã lưu của chính tài khoản. |
| POST /api/unsupervised/history | Phiên Atlas | 201 | Lưu dataset, createdAt, task và result (tối đa 3 MiB/lượt), trả lịch sử mới nhất. |
| `GET /api/experiments` | Đăng nhập | 200 | Lấy lịch sử thí nghiệm. Atlas lọc theo tài khoản, demo dùng lịch sử trong bộ nhớ. |
| `POST /api/experiments` | Admin hoặc researcher | 201 | Lưu kết quả với `datasetId`, `datasetName`, `reductionMethod`, `clusteringMethod`, `k`, `silhouetteScore`, `ari` và `params` tùy chọn. Trả `id` của thí nghiệm. |

## 2. Hai đường dẫn tài liệu chung

| Phương thức và đường dẫn | Quyền | Kết quả |
| --- | --- | --- |
| `GET /docs/` | Công khai | Giao diện Swagger UI của backend đang chạy. |
| `GET /openapi.json` | Công khai | Đặc tả OpenAPI 3.0.3 của chính backend đó. |

Với cấu hình cổng mặc định, chạy `npm.cmd run dev:all` từ thư mục dự án trên Windows rồi mở [Swagger UI trên máy](http://localhost:5000/docs/) hoặc [đặc tả JSON trên máy](http://localhost:5000/openapi.json).

## 3. Đường dẫn bổ sung trên son ở ngoài v1/v2

| Phương thức và đường dẫn | Quyền | HTTP | Kết quả |
| --- | --- | --- | --- |
| `POST /api/datasets` | Admin hoặc researcher | 201 | Tạo dataset từ CSV, cùng bộ xử lý với `POST /api/datasets/upload`. |
| `GET /api/metrics` | Admin | 200 | Chỉ số HTTP, tiến trình và hàng đợi tác vụ ở định dạng văn bản Prometheus. |
| `GET /livez` | Công khai | 200 | Kiểm tra tiến trình backend còn hoạt động. |
| `GET /readyz` | Công khai | 200, 503 | Kiểm tra khả năng nhận việc. Trong chế độ Atlas, kết quả phụ thuộc vào kết nối cơ sở dữ liệu. |

## 4. Bảng đối chiếu API v1 và v2 trên son

Nhánh `son` đăng ký **49 thao tác dùng chung** ở cả hai tiền tố. V2 có thêm năm thao tác ở mục 5. Với các route theo tác vụ, “chủ tác vụ” là người đã đăng nhập và sở hữu tác vụ được chỉ định bởi `{id}`.

### Đăng nhập, hệ thống, dataset và phân tích trực tiếp

Quyền truy cập, đầu vào và phản hồi của các thao tác dưới đây tương ứng với mục 1. Riêng `POST /datasets` và `POST /datasets/upload` dưới cùng tiền tố đều nhận một tệp CSV. Khi cấu hình Google OAuth, URI callback mà backend chấp nhận sử dụng đường dẫn `/api/auth/google/callback`.

| Chức năng | Phương thức và đường dẫn v1 | Phương thức và đường dẫn v2 |
| --- | --- | --- |
| Xem các cách đăng nhập | `GET /api/v1/auth/options` | `GET /api/v2/auth/options` |
| Đăng ký | `POST /api/v1/auth/register` | `POST /api/v2/auth/register` |
| Đăng nhập | `POST /api/v1/auth/login` | `POST /api/v2/auth/login` |
| Mở đăng nhập Google | `GET /api/v1/auth/google` | `GET /api/v2/auth/google` |
| Callback Google | `GET /api/v1/auth/google/callback` | `GET /api/v2/auth/google/callback` |
| Đọc phiên | `GET /api/v1/auth/me` | `GET /api/v2/auth/me` |
| Đăng xuất | `POST /api/v1/auth/logout` | `POST /api/v2/auth/logout` |
| Kiểm tra API và kho dữ liệu | `GET /api/v1/health` | `GET /api/v2/health` |
| Xem thông số hệ thống | `GET /api/v1/system-health` | `GET /api/v2/system-health` |
| Kiểm tra MongoDB | `POST /api/v1/test-db` | `POST /api/v2/test-db` |
| Xóa cache tính toán | `DELETE /api/v1/cache` | `DELETE /api/v2/cache` |
| Liệt kê dataset | `GET /api/v1/datasets` | `GET /api/v2/datasets` |
| Tải CSV lên qua đường dẫn `/upload` | `POST /api/v1/datasets/upload` | `POST /api/v2/datasets/upload` |
| Tạo dataset từ CSV | `POST /api/v1/datasets` | `POST /api/v2/datasets` |
| Đọc dataset | `GET /api/v1/datasets/{id}` | `GET /api/v2/datasets/{id}` |
| Xem trước 20 hàng | `GET /api/v1/datasets/{id}/preview` | `GET /api/v2/datasets/{id}/preview` |
| Tải CSV về | `GET /api/v1/datasets/{id}/download` | `GET /api/v2/datasets/{id}/download` |
| Đổi tên dataset | `PATCH /api/v1/datasets/{id}` | `PATCH /api/v2/datasets/{id}` |
| Xóa dataset | `DELETE /api/v1/datasets/{id}` | `DELETE /api/v2/datasets/{id}` |
| Giảm chiều và phân cụm | `POST /api/v1/compute` | `POST /api/v2/compute` |
| Isolation Forest hoặc Apriori | `POST /api/v1/unsupervised` | `POST /api/v2/unsupervised` |
| Đọc lịch sử thí nghiệm | `GET /api/v1/experiments` | `GET /api/v2/experiments` |
| Lưu thí nghiệm | `POST /api/v1/experiments` | `POST /api/v2/experiments` |

### Tài khoản người dùng

| Hai đường dẫn tương ứng (v1 và v2) | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `GET /api/v1/users`<br>`GET /api/v2/users` | Admin | 200 | Danh sách tài khoản. `offset` mặc định 0, `limit` mặc định 50 và tối đa 100. Có `X-Next-Offset` khi còn trang. |
| `POST /api/v1/users`<br>`POST /api/v2/users` | Admin, Atlas | 201 | Tạo tài khoản mật khẩu với `email`, `name`, `password` và `role` tùy chọn. Vai trò mặc định là `researcher`. |
| `GET /api/v1/users/{id}`<br>`GET /api/v2/users/{id}` | Admin | 200 | Đọc hồ sơ người dùng. Trong demo, `id` lấy từ danh sách tài khoản mẫu. |
| `PATCH /api/v1/users/{id}`<br>`PATCH /api/v2/users/{id}` | Admin, Atlas | 200 | Cập nhật `name`, `role` hoặc cả hai và trả lại hồ sơ. |
| `DELETE /api/v1/users/{id}`<br>`DELETE /api/v2/users/{id}` | Admin, Atlas | 200 | Xóa tài khoản và phiên của người đó. Backend bảo vệ tài khoản của chính admin đang thao tác và admin cuối cùng. |

### Phiên bản dataset và chất lượng dữ liệu

| Hai đường dẫn tương ứng (v1 và v2) | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `GET /api/v1/datasets/{datasetId}/versions`<br>`GET /api/v2/datasets/{datasetId}/versions` | Đăng nhập | 200 | Liệt kê các phiên bản của dataset được phép đọc. |
| `POST /api/v1/datasets/{datasetId}/versions`<br>`POST /api/v2/datasets/{datasetId}/versions` | Admin hoặc researcher | 201 | Gửi CSV bằng trường `file` để tạo phiên bản mới cho dataset. Trả số phiên bản, phiên bản cha và thời điểm tạo. |
| `GET /api/v1/datasets/{datasetId}/versions/{versionId}`<br>`GET /api/v2/datasets/{datasetId}/versions/{versionId}` | Đăng nhập | 200 | Lấy thông tin mô tả của phiên bản. `versionId` là số nguyên từ 1. |
| `GET /api/v1/datasets/{datasetId}/versions/{versionId}/preview`<br>`GET /api/v2/datasets/{datasetId}/versions/{versionId}/preview` | Đăng nhập | 200 | Đọc thông tin và tối đa 20 hàng đầu của phiên bản đã chọn. |
| `GET /api/v1/datasets/{datasetId}/versions/{versionId}/download`<br>`GET /api/v2/datasets/{datasetId}/versions/{versionId}/download` | Đăng nhập | 200 | Xuất tệp CSV được dựng từ các hàng dữ liệu của phiên bản đã chọn. |
| `POST /api/v1/datasets/{datasetId}/versions/{versionId}/quality-checks`<br>`POST /api/v2/datasets/{datasetId}/versions/{versionId}/quality-checks` | Đăng nhập | 202 | Tạo tác vụ kiểm tra giá trị thiếu, hàng trùng, cột hằng và ngoại lệ trên một phiên bản. |
| `GET /api/v1/quality-checks/{id}`<br>`GET /api/v2/quality-checks/{id}` | Chủ tác vụ | 200 | Đọc trạng thái và kết quả của tác vụ kiểm tra chất lượng. |

### Tiền xử lý

| Hai đường dẫn tương ứng (v1 và v2) | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `POST /api/v1/preprocessing-runs`<br>`POST /api/v2/preprocessing-runs` | Admin hoặc researcher | 202 | Gửi `datasetId` và tùy chọn `version`, `features`, `normalization`. Tác vụ điền giá trị thiếu, chuẩn hóa và tạo phiên bản đầu ra. |
| `GET /api/v1/preprocessing-runs`<br>`GET /api/v2/preprocessing-runs` | Đăng nhập | 200 | Liệt kê các lần tiền xử lý của tài khoản hiện tại. |
| `GET /api/v1/preprocessing-runs/{id}`<br>`GET /api/v2/preprocessing-runs/{id}` | Chủ tác vụ | 200 | Đọc tiến độ và phiên bản đầu ra khi tác vụ hoàn tất. |

### Phân tích theo tác vụ

| Hai đường dẫn tương ứng (v1 và v2) | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `POST /api/v1/analyses`<br>`POST /api/v2/analyses` | Đăng nhập | 202 | Gửi `datasetId` và tùy chọn `version`, `features`, `reduction`, `clustering`. Mặc định là phiên bản mới nhất, PCA và K-Means. Tác vụ v2 còn tính chất lượng phép chiếu và chẩn đoán từng điểm. |
| `GET /api/v1/analyses`<br>`GET /api/v2/analyses` | Đăng nhập | 200 | Liệt kê các tác vụ phân tích của tài khoản. |
| `GET /api/v1/analyses/{id}`<br>`GET /api/v2/analyses/{id}` | Chủ tác vụ | 200 | Đọc trạng thái tác vụ phân tích và kết quả khi có. |
| `GET /api/v1/analyses/{id}/results`<br>`GET /api/v2/analyses/{id}/results` | Chủ tác vụ | 200 | Lấy kết quả phân tích đã hoàn thành, gồm tọa độ và nhãn cụm theo cấu hình. |
| `GET /api/v1/analyses/{id}/visualization`<br>`GET /api/v2/analyses/{id}/visualization` | Chủ tác vụ | 200 | Lấy dữ liệu `scatter3d`. Mỗi điểm có `rowIndex`, `x`, `y`, `z`, `cluster`. |
| `GET /api/v1/analyses/{id}/evaluation`<br>`GET /api/v2/analyses/{id}/evaluation` | Chủ tác vụ | 200 | Đọc các chỉ số như silhouette, ARI và phương sai giải thích. Với kết quả tính bằng v2, API v2 còn trả các chỉ số như Davies–Bouldin, trustworthiness và tổng hợp ngoại lệ. |

### Báo cáo và trạng thái tác vụ

| Hai đường dẫn tương ứng (v1 và v2) | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `POST /api/v1/analyses/{id}/reports`<br>`POST /api/v2/analyses/{id}/reports` | Admin hoặc researcher, chủ tác vụ | 202 | Tạo báo cáo từ phân tích thành công. `format` nhận `html` (mặc định) hoặc `json`. Trả mã tác vụ báo cáo riêng. |
| `GET /api/v1/reports/{id}`<br>`GET /api/v2/reports/{id}` | Chủ tác vụ | 200 | Đọc trạng thái và thông tin mô tả báo cáo. |
| `GET /api/v1/reports/{id}/download`<br>`GET /api/v2/reports/{id}/download` | Chủ tác vụ | 200 | Tải tệp HTML hoặc JSON khi tác vụ báo cáo thành công. Dùng mã tác vụ báo cáo ở `{id}`. |
| `GET /api/v1/jobs/{id}`<br>`GET /api/v2/jobs/{id}` | Chủ tác vụ | 200 | Đọc loại tác vụ, trạng thái, tiến độ, kết quả hoặc lỗi. |
| `POST /api/v1/jobs/{id}/cancel`<br>`POST /api/v2/jobs/{id}/cancel` | Chủ tác vụ | 200 | Hủy tác vụ ở trạng thái `queued`. Backend trả `409` nếu tác vụ đã chạy hoặc đã kết thúc. |

Khi nhận `202 Accepted`, lấy `data.id` hoặc đường dẫn trong header `Location` để theo dõi tác vụ bằng `GET /api/v1/jobs/{id}` hay `GET /api/v2/jobs/{id}`. Khi trạng thái thành `succeeded`, có thể đọc kết quả hoặc tải báo cáo. Nếu đọc kết quả quá sớm, backend trả `409`. Các thao tác tạo tác vụ nhận header `Idempotency-Key` tùy chọn để gọi lại cùng yêu cầu.

## 5. Năm thao tác riêng của v2 trên son

| Phương thức và đường dẫn | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `POST /api/v2/analyses/optimize` | Đăng nhập | 202 | Gửi `datasetId`, cấu hình đầy đủ `reduction` và `clustering`. Có thể chọn `version` và `features`. Tối đa 200 hàng và 9 cấu hình ứng viên. Đọc bảng xếp hạng qua tác vụ được trả về. |
| `GET /api/v2/analyses/{id}/points` | Chủ tác vụ | 200 | Đọc bảng điểm sau khi phân tích. Mỗi hàng có `rowIndex`, `id`, `label`, `values`, `coordinates`, `cluster`, `isNoise`, `excluded` và chẩn đoán ngoại lệ khi có. |
| `DELETE /api/v2/analyses/{id}/points/{rowIndex}` | Chủ tác vụ | 200 | Đánh dấu loại một hàng khỏi bảng điểm của lần phân tích. `rowIndex` bắt đầu từ 0. |
| `POST /api/v2/analyses/{id}/points/{rowIndex}/restore` | Chủ tác vụ | 200 | Khôi phục hàng đã loại vào bảng điểm. |
| `POST /api/v2/analyses/{id}/points/filter` | Chủ tác vụ | 200 | Gửi `action` nhận một trong bốn giá trị `exclude-outliers`, `exclude-noise`, `exclude-outliers-and-noise`, `restore-all`. Trả `excludedCount`. |

**Ví dụ xem bảng điểm của một lần phân tích.** Sau khi tác vụ phân tích thành công, gọi `GET /api/v2/analyses/{id}/points?offset=0&limit=20`. Đọc các hàng ở `data`, tổng số hàng phù hợp ở `X-Total-Count` và vị trí trang sau ở `X-Next-Offset` khi có. `limit` mặc định là 100, tối đa 500. Thêm `includeExcluded=true` để xem cả các hàng đã loại.

Thao tác loại hoặc khôi phục điểm chỉ thay đổi bảng điểm của lần phân tích đó. Nhánh `son` lưu danh sách hàng đã loại trong bộ nhớ của tiến trình. Khi tiến trình khởi động lại, các dấu loại này mất.

## Đối chiếu với Swagger và mã nguồn

Trên `codex/integrate-auth`, 22 cặp phương thức và đường dẫn dưới `/api` đều xuất hiện trong OpenAPI. Riêng `displayName` khi đăng ký, Swagger ghi tối đa 120 ký tự còn bộ kiểm tra đầu vào thực tế giới hạn 80. Bảng ở mục 1 dùng giới hạn mà backend thực thi.

| Nhánh `son` | Backend đăng ký | OpenAPI liệt kê |
| --- | ---: | ---: |
| `/api` không có số phiên bản | 24 | 23 |
| `/api/v1` | 49 | 46 |
| `/api/v2` | 54 | 9 |
| Ngoài `/api` | 4 | 2 |

Ví dụ, backend `son` đăng ký `GET /api/v1/datasets/{id}/preview`, `GET /api/v1/datasets/{id}/download` và `POST /api/v1/datasets/upload`. Cả ba đều vắng trong Swagger của nhánh đó. Việc đối chiếu v1/v2 dựa trên các hàm đăng ký route, tiền tố gắn trong Express và điều kiện `isV2`.

- Nhánh hiện tại có [điểm đăng ký Express](../backend/src/app.ts), [các route](../backend/src/routes), [middleware xác thực](../backend/src/middleware/configure.ts), [kiểm tra tài khoản](../backend/src/auth/passwordAuth.ts) và [đặc tả OpenAPI](../backend/src/docs/openapi.ts).
- Nhánh `son` có [điểm đăng ký và tiền tố](https://github.com/Harry5867/DIMENSION-LAB-PROJECT/blob/c8945ae69cbf7444a14b23abf518c973eae3deee/backend/src/app.ts), [route dùng chung và riêng của v2](https://github.com/Harry5867/DIMENSION-LAB-PROJECT/blob/c8945ae69cbf7444a14b23abf518c973eae3deee/backend/src/routes/v1.ts), [middleware xác thực](https://github.com/Harry5867/DIMENSION-LAB-PROJECT/blob/c8945ae69cbf7444a14b23abf518c973eae3deee/backend/src/middleware/configure.ts) và [đặc tả OpenAPI](https://github.com/Harry5867/DIMENSION-LAB-PROJECT/blob/c8945ae69cbf7444a14b23abf518c973eae3deee/backend/src/docs/openapi.ts).
