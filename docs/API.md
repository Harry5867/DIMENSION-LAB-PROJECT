# Danh mục API của Dimension Lab
## 1. API tương thích dưới `/api`

Bảng này liệt kê các endpoint tương thích dưới `/api`.

Swagger tại `/openapi.json` liệt kê các route đang phục vụ. Mục 3–5 giữ bảng tham chiếu cho phần API mở rộng của nhánh tích hợp, hiện chờ đưa vào backend đang chạy.

**Quyền truy cập.** “Đăng nhập” gồm `viewer`, `researcher` và `admin`. Demo nhận `Authorization: Bearer <token>`. Atlas dùng cookie HttpOnly `lab_session` và yêu cầu `Origin` phù hợp khi ghi dữ liệu. Backend giới hạn dataset riêng trong Atlas theo tài khoản. Các route đổi tên và xóa chỉ áp dụng cho dataset có thể chỉnh sửa. Hai dataset mẫu `cancer_wdbc` và `wholesale_customers` được bảo vệ.

**Cách đọc phản hồi.** Với JSON thành công, đọc dữ liệu ở `data`. Với JSON lỗi, đọc `error.code` và `error.message`. Mỗi phản hồi dưới `/api` có header `X-Request-Id` để đối chiếu log. Cột HTTP ghi mã trả về chính. Các route tải tệp và chuyển hướng ghi rõ định dạng riêng.

### Đăng nhập và phiên làm việc

| Phương thức và đường dẫn | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `GET /api/auth/options` | Công khai | 200 | Đọc `mode`, `google` và `registration` để biết nút đăng nhập nào có thể dùng. |
| `POST /api/auth/register` | Công khai khi bật đăng ký | 201 | Tạo tài khoản từ `email`, `password`, `displayName`. Backend cho đăng ký trong chế độ Atlas ngoài production. Tên hiển thị dài 1–80 ký tự sau khi cắt khoảng trắng. |
| `POST /api/auth/login` | Công khai | 200 | Gửi `email` và `password`. Demo trả `token` và `user`, có thể chọn `role` demo. Atlas xác thực tài khoản và đặt cookie phiên. |
| `POST /api/auth/verify-email` | Công khai | 200 | Gửi `challenge` và mã xác minh. Backend cấp phiên Atlas khi mã hợp lệ. |
| `GET /api/auth/google` | Công khai khi bật Google | 302 | Mở luồng đăng nhập. Trình duyệt được chuyển đến Google. |
| `GET /api/auth/google/callback` | Luồng OAuth của Google | 303 | Xử lý phản hồi của Google. Khi thành công, backend đặt cookie và chuyển về Workspace. Khi xác thực OAuth thất bại, trình duyệt có thể được chuyển về Welcome. |
| `GET /api/auth/me` | Phiên tùy chọn | 200 | Đọc `authenticated` và `user`. Khi chưa đăng nhập, `user` bằng `null`. |
| `POST /api/auth/logout` | Demo cần phiên. Atlas cần Origin hợp lệ | 200 | Thu hồi phiên. Atlas cũng xóa cookie và chấp nhận yêu cầu khi phiên đã hết hạn. Trả `authenticated: false`. |

### Hệ thống

| Phương thức và đường dẫn | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `GET /api/health` | Công khai | 200, 503 | Kiểm tra API và chế độ lưu trữ. Khi chạy Atlas, backend trả `503` nếu kho dữ liệu không sẵn sàng. |
| `GET /api/system-health` | Admin | 200 | Đọc uptime, bộ nhớ của tiến trình và các thông số lưu trữ. |
| `POST /api/test-db` | Admin | 200 | Kiểm tra kết nối MongoDB. Đọc `data.connected` để biết kết quả. Demo trả `false` vì dùng bộ nhớ. |
| `DELETE /api/cache` | Admin | 200 | Xóa bộ nhớ đệm của phép tính và trả `clearedCount`. |

### Dataset và CSV

| Phương thức và đường dẫn | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `GET /api/datasets` | Đăng nhập | 200 | Liệt kê dataset. Query `offset` mặc định 0, `limit` mặc định 50 và tối đa 100. Có `X-Next-Offset` khi còn trang sau. |
| `GET /api/datasets/usage` | Đăng nhập | 200 | Trả `fileCount`, `usedBytes`, `maxFiles`, `maxBytes` của tài khoản hiện tại trên Atlas. Demo trả `null`. |
| `POST /api/datasets/upload` | Admin hoặc researcher | 201 | Tạo dataset từ một tệp CSV UTF-8, tối đa 5 MiB. Gửi `multipart/form-data` với trường `file`. Kết quả có `id` của dataset mới. |
| `GET /api/datasets/{id}` | Đăng nhập | 200 | Lấy thông tin dataset và toàn bộ hàng trong `rawRows`. |
| `GET /api/datasets/{id}/preview` | Đăng nhập | 200 | Lấy thông tin dataset và tối đa 20 hàng đầu trong `rows`. |
| `GET /api/datasets/{id}/download` | Đăng nhập | 200 | Tải tệp CSV đính kèm. Với tệp đã tải lên, đây là nội dung gốc. |
| `PATCH /api/datasets/{id}` | Admin hoặc researcher | 200 | Đổi tên qua trường JSON `name` dài 1–200 ký tự. Trả lại thông tin sau khi đổi. |
| `DELETE /api/datasets/{id}` | Demo cần admin. Atlas cho admin hoặc researcher | 200 | Xóa dataset có quyền sửa. Trong Atlas, thao tác áp dụng cho dataset thuộc tài khoản hiện tại. |

Khi vượt quota tài khoản, upload trả `409 DATASET_QUOTA_EXCEEDED`. Upload và hai API phân tích trả `429` kèm `Retry-After` khi chạm giới hạn tần suất hoặc xử lý đồng thời. Xem [cấu hình vận hành](operations.md#hạn-mức-và-kết-quả-api).

### Phân tích và lịch sử thí nghiệm

| Phương thức và đường dẫn | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `POST /api/compute` | Đăng nhập | 200 | Gửi `matrix`, `groundTruth`, `reductionConfig`, `clusteringConfig`. Trả tọa độ, kết quả phân cụm và chỉ số đánh giá. Header `X-Cache` cho biết `HIT` hoặc `MISS`. |
| `POST /api/unsupervised` | Đăng nhập | 200 | Gửi `kind`, `rows`, `features`, `options`. `anomaly` dùng Isolation Forest và thêm `normalization`. `association` dùng Apriori. Trả kết quả ngay. |
| `GET /api/unsupervised/history` | Đăng nhập | 200 | Lấy tối đa năm kết quả đã lưu của tài khoản Atlas hiện tại. |
| `POST /api/unsupervised/history` | Đăng nhập | 201 | Lưu một kết quả phân tích vào lịch sử tài khoản Atlas. |
| `GET /api/experiments` | Đăng nhập | 200 | Lấy lịch sử thí nghiệm. Atlas lọc theo tài khoản, demo dùng lịch sử trong bộ nhớ. |
| `POST /api/experiments` | Admin hoặc researcher | 201 | Lưu kết quả với `datasetId`, `datasetName`, `reductionMethod`, `clusteringMethod`, `k`, `silhouetteScore`, `ari` và `params` tùy chọn. Trả `id` của thí nghiệm. |

## 2. Hai đường dẫn tài liệu chung

| Phương thức và đường dẫn | Quyền | Kết quả |
| --- | --- | --- |
| `GET /docs/` | Công khai | Giao diện Swagger UI của backend đang chạy. |
| `GET /openapi.json` | Công khai | Đặc tả OpenAPI 3.0.3 của chính backend đó. |

Với cấu hình cổng mặc định, chạy `npm.cmd run dev:all` từ thư mục dự án trên Windows rồi mở [Swagger UI trên máy](http://localhost:5000/docs/) hoặc [đặc tả JSON trên máy](http://localhost:5000/openapi.json).

## 3. Đường dẫn bổ sung ngoài v1/v2

| Phương thức và đường dẫn | Quyền | HTTP | Kết quả |
| --- | --- | --- | --- |
| `POST /api/datasets` | Admin hoặc researcher | 201 | Tạo dataset từ CSV, cùng bộ xử lý với `POST /api/datasets/upload`. |
| `GET /api/metrics` | Admin | 200 | Chỉ số HTTP, tiến trình và hàng đợi tác vụ ở định dạng văn bản Prometheus. |
| `GET /livez` | Công khai | 200 | Kiểm tra tiến trình backend còn hoạt động. |
| `GET /readyz` | Công khai | 200, 503 | Kiểm tra khả năng nhận việc. Trong chế độ Atlas, kết quả phụ thuộc vào kết nối cơ sở dữ liệu. |

## 4. API v1 và v2

V1 có **49 thao tác**; v2 có 49 thao tác tương ứng cùng năm thao tác đặc thù ở mục 5. Với các route theo tác vụ, “chủ tác vụ” là người đã đăng nhập và sở hữu tác vụ được chỉ định bởi `{id}`.

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

## 5. Năm thao tác riêng của v2

| Phương thức và đường dẫn | Quyền | HTTP | Đầu vào và kết quả |
| --- | --- | --- | --- |
| `POST /api/v2/analyses/optimize` | Đăng nhập | 202 | Gửi `datasetId`, cấu hình đầy đủ `reduction` và `clustering`. Có thể chọn `version` và `features`. Tối đa 200 hàng và 9 cấu hình ứng viên. Đọc bảng xếp hạng qua tác vụ được trả về. |
| `GET /api/v2/analyses/{id}/points` | Chủ tác vụ | 200 | Đọc bảng điểm sau khi phân tích. Mỗi hàng có `rowIndex`, `id`, `label`, `values`, `coordinates`, `cluster`, `isNoise`, `excluded` và chẩn đoán ngoại lệ khi có. |
| `DELETE /api/v2/analyses/{id}/points/{rowIndex}` | Chủ tác vụ | 200 | Đánh dấu loại một hàng khỏi bảng điểm của lần phân tích. `rowIndex` bắt đầu từ 0. |
| `POST /api/v2/analyses/{id}/points/{rowIndex}/restore` | Chủ tác vụ | 200 | Khôi phục hàng đã loại vào bảng điểm. |
| `POST /api/v2/analyses/{id}/points/filter` | Chủ tác vụ | 200 | Gửi `action` nhận một trong bốn giá trị `exclude-outliers`, `exclude-noise`, `exclude-outliers-and-noise`, `restore-all`. Trả `excludedCount`. |

**Ví dụ xem bảng điểm của một lần phân tích.** Sau khi tác vụ phân tích thành công, gọi `GET /api/v2/analyses/{id}/points?offset=0&limit=2&includeExcluded=false`. Trong ví dụ minh họa, nếu có sáu điểm chưa bị loại, response chứa hai điểm, `X-Total-Count: 6` và `X-Next-Offset: 2`. Total count là số điểm sau lọc theo `includeExcluded` và trước phân trang; thêm `includeExcluded=true` sẽ tính cả điểm đã loại. `limit` mặc định là 100, tối đa 500.

```http
GET /api/v2/analyses/{id}/points?offset=0&limit=2&includeExcluded=false
Authorization: Bearer <token>

HTTP/1.1 200 OK
X-Total-Count: 6
X-Next-Offset: 2
Content-Type: application/json

{"success":true,"data":[{"rowIndex":0,"id":1,"label":"A","values":{},"coordinates":[0,0,0],"cluster":0,"isNoise":false,"excluded":false},{"rowIndex":1,"id":2,"label":"A","values":{},"coordinates":[0,0,0],"cluster":0,"isNoise":false,"excluded":false}],"timestamp":"2026-01-01T00:00:00.000Z"}
```

Thao tác loại hoặc khôi phục điểm chỉ thay đổi bảng điểm của lần phân tích đó. Danh sách hàng đã loại lưu trong bộ nhớ tiến trình và mất khi tiến trình khởi động lại.

## Phân trang, lỗi và đối chiếu mã nguồn

Chỉ `GET /api[/v1|/v2]/datasets`, `GET /api/v1|/v2/users` và `GET /api/v2/analyses/{id}/points` hỗ trợ phân trang:

- Dataset và user: `offset=0`, `limit=50` mặc định; `limit` từ 1 đến 100, `offset` từ 0 đến 100000. Dataset mẫu đứng trước (sắp ID tăng dần), sau đó dataset người dùng theo `createdAt` giảm dần (ID tăng dần khi trùng thời điểm). User sắp theo `createdAt` giảm dần; demo trả theo thứ tự admin, researcher, viewer.
- Analysis points: `offset=0`, `limit=100` mặc định; `limit` từ 1 đến 500. Điểm giữ thứ tự hàng nguồn. `includeExcluded` mặc định false; khi true, các điểm đã loại cũng được trả về.
- Không có query parameter sort/filter. Query parameter không được endpoint nhận diện sẽ bị bỏ qua. Các API liệt kê version, preprocessing run, analysis và experiment hiện trả toàn bộ danh sách.
- Dataset/user không trả tổng số; `X-Next-Offset` chỉ xuất hiện khi còn trang. Với analysis points, `X-Total-Count` là số điểm sau lọc theo `includeExcluded`, trước khi áp dụng offset/limit. `X-Next-Offset` chỉ có khi còn trang.
- Phân trang offset không phải snapshot. Thay đổi dữ liệu hoặc trạng thái loại điểm giữa hai lần gọi có thể làm lệch nội dung trang tiếp theo; tổng điểm cũng có thể thay đổi khi trạng thái loại điểm đổi.

Trên các route `/api` đang chạy trong nhánh này, JSON thành công có `success: true`, `data` và `timestamp`. JSON lỗi có `success: false`, `error` và `timestamp`. Đối tượng `error` gồm `code`, `message` và có thể có `details`. HTTP lỗi thường gặp gồm 400, 401, 403, 404, 409, 413, 429, 500 và 503.

Mã nguồn đối chiếu trong repository:

- Điểm lắp route: `backend/src/app.ts`.
- Route: `backend/src/routes/`.
- Middleware xác thực và giới hạn request: `backend/src/middleware/configure.ts`.
- Kiểm tra tài khoản mật khẩu: `backend/src/auth/passwordAuth.ts`.
- Đặc tả đang được phục vụ tại `/openapi.json`: `backend/src/docs/openapi.ts`.
- Kiểm thử đồng bộ route/schema: `tests/unit/openapi.test.ts`; kiểm thử HTTP: `tests/integration/system-api.integration.ts`.
