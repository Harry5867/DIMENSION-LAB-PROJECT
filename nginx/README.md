# Nginx

[nginx.conf](nginx.conf) là cấu hình triển khai tham chiếu. Nó phục vụ bản build tại `/var/www/explorer/dist` và chuyển các yêu cầu `/api/` đến Express ở `127.0.0.1:5000`. Cấu hình còn khai báo HTTPS, request ID, giới hạn upload/rate/connection và chuyển tiếp `/livez`, `/readyz`.

Backend bind loopback. Với Atlas, chạy service API cùng một hoặc nhiều `npm run worker`; đặt `LAB_API_JOB_WORKER_ENABLED=false` cho API instances khi worker đã tách riêng. Chi tiết biến môi trường và thứ tự rollout ở [operations & API lifecycle](../docs/architecture/operations-and-lifecycle.md).

Khi thay đổi cấu hình triển khai, kiểm tra `nginx -t` trên máy đích, xác minh `/livez` và `/readyz` qua proxy, gọi `/api/health`, rồi kiểm tra asset, tải CSV, OAuth callback và các URL hash. Kết quả kiểm thử Vite cục bộ xác minh proxy phát triển.

[Backend](../backend/README.md) · [Kiến trúc](../docs/architecture/system-overview.md)
