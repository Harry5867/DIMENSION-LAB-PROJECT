# Kiểm thử và rà soát DIMENSION / LAB

## Mốc và phạm vi

Mốc đầu là `main` tại `6fbac6c`, kèm phần nhóm đang sửa trong 12 tệp và `server/computeValidation.ts` chưa được Git theo dõi. Các thay đổi có sẵn được giữ lại, gồm kiểm tra ma trận, giới hạn `k`, imputation và Silhouette. Không tìm thấy `AGENTS.md` trong repository hoặc các thư mục cha đã kiểm tra. Đã đọc `package.json`, README chính, README API, tài liệu kiến trúc và bàn giao workspace, cùng các test có sẵn. Kiểm tra theo hành vi trong mã khi tài liệu kiến trúc mô tả chức năng chưa triển khai.

Frontend dùng Vite, backend dùng Express, thuật toán TypeScript được gọi qua HTTP hoặc chạy trong trình duyệt. Chạy ứng dụng với `npm run dev:all`. Kiểm thử HTTP khởi động API riêng trên loopback và dùng bộ nhớ RAM. Kiểm tra Vite dùng cổng riêng và chuyển proxy đến API thử. Các ca này dùng dữ liệu có sẵn trong repo và một CSV tự tạo. MongoDB được mô phỏng ở ca lỗi lưu trữ. Các bước kiểm thử không truy cập MongoDB thật.

| Kiểm tra | Trước | Sau |
| --- | --- | --- |
| `npm test` | 76/76 đạt | 87/87 đạt |
| `npm run build` | TypeScript và Vite đạt | TypeScript và Vite đạt |
| HTTP trong môi trường thử | Tái hiện cấp quyền admin khi thiếu phiên, upload sai trả 500 và PCA sinh trục giả. `None`, `k > n`, ma trận lệch và cache đã có hành vi đúng. | `npm run test:api` đạt. Ca gồm phiên, phân quyền, hai CSV mẫu, CRUD, mã lỗi đầu vào, đối chiếu kết quả và xóa cache. |
| Vite và proxy | Chưa chạy ở mốc đầu. | HTML, module đầu vào, CSV mẫu và đăng nhập qua proxy trả 200. Dataset Wisconsin trả đúng 569 hàng qua proxy có xác thực. |
| Trình duyệt | Không có phép đo. | Quyền điều khiển trình duyệt cục bộ bị tắt trong cài đặt Work. Không chạy thao tác giao diện trực tiếp. |

## Lỗi và bằng chứng

| Mức | Tái hiện | Kỳ vọng → thực tế trước sửa | Sửa và xác minh |
| --- | --- | --- | --- |
| Nghiêm trọng | Gọi `/api/auth/me`, upload, đọc rồi xóa CSV thử mà thiếu header. Gọi login với chỉ `role=admin`. | Phiên rỗng và các API dữ liệu trả 401 → máy chủ gán admin, upload 201, đọc và xóa 200, login cấp token tĩnh. | Xác thực trước khi đọc nội dung request. Dùng phiên ngẫu nhiên, hết hạn 8 giờ, thu hồi khi logout. Kiểm thử HTTP xác nhận thiếu hoặc giả token trả 401, viewer xóa bị 403. Test đơn vị xác nhận token hết hạn bị từ chối. CORS không chấp nhận origin ngoài danh sách kiểm tra. |
| Cao | Mô phỏng MongoDB đã kết nối nhưng thao tác đọc hoặc ghi bị lỗi. | Lỗi phải đến caller → nhánh cũ bắt lỗi và dùng RAM hoặc trả kết quả ghi thành công, thấy khi đọc mã. | Chọn một chế độ lưu trữ lúc khởi động. Đọc, ghi, đổi tên và xóa trên MongoDB đẩy lỗi về caller. Test mock driver xác nhận các thao tác dataset và ghi experiment bị reject, không cần MongoDB thật. Mật khẩu demo chỉ cấp quyền vào chế độ RAM. |
| Cao | PCA trên `[[0,0,0],[1,0,0],[10,0,0]]`, rồi DBSCAN với ε 1,1 và minPts 2. | PC2/PC3 đều 0, cụm `[0,0,-1]` → ví dụ hàng đầu có PC2 = −1,831, PC3 = 1,024 và cả ba điểm là nhiễu. | Triệt vector của trục có phương sai dưới ngưỡng sai số tương đối. Unit test và HTTP xác nhận tọa độ, phân cụm và kết quả cache. Tăng phiên bản cache để không phục vụ lại kết quả cũ. |
| Cao | Upload CSV với header `a,a` hoặc `a, a`, hàng thiếu/thừa trường, ID `001`, nhãn `001`, timestamp ISO, ô trống và số 0. | Header mơ hồ hoặc lệch cột phải báo lỗi, dữ liệu hợp lệ giữ nguyên định danh → Papa tự đổi header hoặc cột ghi đè nhau, hàng thiếu lọt qua, timestamp mất, ID/nhãn thành số; CSV thừa trường trả 500. | Kiểm tra header, độ rộng và giới hạn. Giữ ngoại lệ delimiter dư trong header Wisconsin. Giữ ID, nhãn và timestamp dưới dạng văn bản, ô trống là null. HTTP kiểm tra tệp sai trả 400, trên 5 MiB trả 413 và CRUD giữ thứ tự. Unit test đối chiếu ID, nhãn và timestamp đến bản CSV xuất. |
| Cao | CSV có đúng ba cột số với ít giá trị khác nhau và không khai báo nhãn. | Giữ đủ ba đặc trưng → parser lấy cột số đầu làm nhãn và từ chối tệp vì còn hai đặc trưng. | Bỏ suy đoán nhãn chỉ từ số lượng giá trị số. Ưu tiên tên nhãn rõ ràng. Test CSV nhỏ và hai CSV tích hợp đều đạt. |
| Trung bình | Tính ARI cho `['A','A']` so với `[0,0]` hoặc thêm hàng thiếu nhãn. | Hai phân hoạch giống nhau cho 1; hàng thiếu nhãn không tham gia → nhận 0 ở ca một cụm và có thể bị sai vì coi ô trống là một lớp. | Dùng đếm cặp thưa, bỏ nhãn thiếu và trả null nếu còn dưới hai nhãn. Test kiểm tra 1, 0 và null. Silhouette tiếp tục qua các ca singleton, điểm trùng và nhiễu. |
| Trung bình | API trả lỗi trong khi đang chạy phép chiếu, đổi dataset hoặc đổi tên khi phản hồi cũ còn chờ. | Tác vụ cũ phải bị hủy hoặc bỏ qua → phép chiếu dự phòng cũ chạy đồng bộ trên luồng giao diện, và callback đổi tên/xóa có thể dựa vào ID cũ, theo mã trước sửa. | Phép chiếu dự phòng chạy bằng Web Worker có hủy. Đối chiếu ID khi hoàn thành đổi tên/xóa, kiểm tra lượt tác vụ trước khi cập nhật kết quả. Test mô phỏng Worker xác nhận phản hồi sau khi hủy bị bỏ. Test snapshot xác nhận nhãn và export đọc cấu hình đã chạy. Kiểm tra thao tác thực trên Explore còn mở. |
| Trung bình | Lọc điểm, chạy lại phân cụm, rồi khôi phục điểm. | Điểm khôi phục phải cùng cấu hình đã chạy → mã trước sửa giữ bản sao nhãn của lần chạy cũ. | Lần phân cụm mới dùng toàn bộ embedding và xóa bản sao đã cũ khi thành công. Build và test đánh giá điểm giữ lại đạt. Cần chạy thao tác trực tiếp trên Explore để xác nhận UI. |

## Thuật toán và dữ liệu đã chạy

- Wisconsin Breast Cancer có 569 hàng và 30 đặc trưng. Wholesale Customers có 440 hàng và 7 đặc trưng, tính cả `Region` và không tính `Channel` là nhãn. Đã so mảng hàng và nhãn của parser với phản hồi API, cùng thứ tự ID và vị trí hàng qua test phép chiếu. CSV tải thử đi qua upload, đọc, đổi tên và xóa.
- K-Means cho tâm 1 và 21 với dữ liệu `[0,2,20,22]`, WCSS bằng 4. Kiểm tra thêm điểm trùng và `k > n`. DBSCAN cho cả ca cụm có nhiễu và toàn bộ là nhiễu. PCA thử cột hằng, tập hằng và trục phương sai 0.
- Các test có sẵn xác nhận GMM tách hai nhóm và xác suất hữu hạn, Isolation Forest xếp điểm xa cao hơn nhóm chính, Apriori có support, confidence và lift đúng với giao dịch mẫu.
- Với cùng fixture 48 hàng, 6 đặc trưng, bốn nhóm, so 5 hàng xóm gần nhất trên ba seed 17, 42 và 99. t-SNE giữ 97,5% mỗi seed. UMAP giữ lần lượt 85,4%, 83,3% và 73,3%. Cả hai trả đủ 48 tọa độ 3D hữu hạn. Test hồi quy dùng seed 42 và thử thêm dữ liệu trùng hoàn toàn. Đây là phép kiểm trên fixture dễ tách.
- HTTP và client cho cùng tọa độ PCA với `None`; API trả mảng phân cụm rỗng, các chỉ số null. Ma trận lệch cột và `k > n` trả 400. Cache thực tế `MISS → HIT`; xóa cache xong lượt tiếp theo là `MISS`. Khởi tạo MongoDB và lỗi ghi được mô phỏng riêng. Đường dự phòng trên browser chưa chạy qua giao diện.

## Hiệu năng

Windows 10.0.26300, Intel Core i5-1135G7, 8 luồng, 7,8 GiB RAM, Node v26.10.0. Không tìm thấy script benchmark đang được theo dõi. Đo bằng harness cục bộ, ba lượt mỗi cấu hình và mỗi kích thước. Dùng 30 đặc trưng Wisconsin theo thứ tự gốc, chuẩn hóa Z-score. Mốc 500 lấy 500 hàng đầu, mốc 1.000 lặp dữ liệu 569 hàng để đủ 1.000 hàng. t-SNE dùng perplexity 30, learning rate 100 và 250 vòng. UMAP dùng 15 hàng xóm, minDist 0,1 và mặc định 200 epoch. Silhouette đo trực tiếp trên tọa độ PCA với hai nhãn gốc. HTTP đo từ gửi request đến đọc xong JSON trên loopback, chỉ tính cache MISS, giới hạn 60 giây. Dùng giá trị nhãn đầu tiên khác nhau giữa các lượt để ép MISS khi `None`.

| Hàng | Phép đo | Thuật toán trực tiếp, trước → sau | HTTP, trước → sau | Tính trong API, trước → sau |
| ---: | --- | ---: | ---: | ---: |
| 500 | t-SNE | 945,1 → 923,6 ms | 1.114,7 → 952,5 ms | 1.102 → 939 ms |
| 500 | UMAP | 388,5 → 321,6 ms | 367,7 → 346,0 ms | 358 → 335 ms |
| 500 | Silhouette | 7,3 → 4,0 ms | — | — |
| 1.000 | t-SNE | 11.440,4 → 3.998,1 ms | 13.687,6 ms (1/3) → 4.387,8 ms (3/3) | 13.625 ms (1/3) → 4.350 ms (3/3) |
| 1.000 | UMAP | 2.848,2 → 812,8 ms | 2.603,9 → 864,4 ms | 2.560 → 847 ms |
| 1.000 | Silhouette | 45,0 → 11,1 ms | — | — |

Đơn vị là trung vị theo các lượt thành công. Hai lượt HTTP t-SNE 1.000 ở mốc đầu báo `TypeError: fetch failed`, chưa xác định nguyên nhân. Các ca khác không báo lỗi hoặc timeout. Đỉnh RSS của tiến trình đo ở mốc 500 là 89,8 → 118,6 MiB và ở mốc 1.000 là 116,4 → 140,5 MiB. Đây là đỉnh tích lũy của tiến trình Node đo, chưa gồm API con hoặc trình duyệt. Silhouette không có endpoint riêng nên không báo thời gian HTTP độc lập. Chưa đo thời gian thao tác giao diện. Chênh lệch giữa hai lượt không chứng minh mức tăng tốc hay thay đổi RAM do bản sửa vì chưa kiểm soát tải nền hoặc ngẫu nhiên của thuật toán.

## Mã thừa và giới hạn còn lại

- Xóa export `getDb`, lớp `ConflictError` và thuộc tính `AppError.isOperational` sau khi tìm tham chiếu trong source, script, test và tài liệu. Xóa parser URL-encoded vì client và hợp đồng API chỉ dùng JSON và multipart. Xóa token tĩnh, nhánh tự gán admin, cơ chế ghi trùng vào RAM ở chế độ MongoDB và vòng thử kết nối tự đổi chế độ, vì các nhánh này trực tiếp gây lỗi.
- Bỏ phần dựng điểm raw trùng với `makePoints` và cách tính riêng của API cho phép chiếu. TypeScript được chạy với kiểm tra biến và tham số không dùng. Giữ dependency, dữ liệu nguồn, fixture và script. Giữ 21 SVG Stories cũ vì tài liệu bàn giao còn tham chiếu thư mục minh họa và bản WebP hiện hành có quy trình nguồn riêng. Giữ CSS và tài nguyên động khi chưa chứng minh được chúng vô dụng.
- Chưa có tài khoản thật hoặc quyền sở hữu dataset. Ba vai trò demo cùng dùng một workspace. Trước khi cho nhiều người lưu dữ liệu riêng, cần triển khai danh tính và kiểm tra quyền sở hữu tại tầng API, rồi kiểm thử A truy cập dataset B.
- Cần bật quyền kiểm thử trình duyệt trong Work hoặc chạy thủ công trên Chrome. Dùng CSV mẫu để thử đăng nhập, chạy PCA, đổi chuẩn hóa, kiểm tra nhãn kết quả trước khi chạy lại, đổi dataset khi phản hồi cũ đang chờ, chọn điểm và xuất CSV/JSON. Lặp với API tắt để quan sát Web Worker, rồi đo độ trễ giao diện và kiểm tra thao tác lọc/khôi phục.
- Cần một MongoDB thử dùng riêng để xác nhận CRUD thực, mất kết nối giữa lúc ghi và khởi động lại. Tệp đã lưu theo parser cũ có thể cần nhập lại từ CSV gốc để khôi phục ID hoặc timestamp từng bị mất.
- API vẫn chạy thuật toán đồng bộ, có thể giữ các request khác chờ trong ca dài. Giới hạn t-SNE/UMAP là 1.000 hàng trong bản này. Trước khi tăng giới hạn, cần tách tác vụ nặng khỏi luồng HTTP, đo p50/p95 khi có request đồng thời và đo RAM tiến trình API. Giới hạn 128 cột cũng cần được nhóm xem lại nếu muốn hỗ trợ tải trực tiếp vector ảnh có nhiều hơn 128 đặc trưng.

Các thay đổi ở working tree để review. Chưa commit, push hay triển khai.
