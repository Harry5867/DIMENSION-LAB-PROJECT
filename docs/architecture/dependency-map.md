# Hướng phụ thuộc

- Frontend app ghép các feature và shared. Shared chứa provider, preference, API client và giao diện tái sử dụng.
- Frontend Worker và Express service nhập Algorithms và Contracts. Express truy cập lưu trữ qua repositories. Browser đi qua HTTP để dùng API, dữ liệu và phiên.
- Algorithms nhập Contracts và parser CSV. Contracts đứng độc lập với ứng dụng và lớp lưu trữ.
- Tests và script ở root nhập điểm vào theo nhiệm vụ. Vị trí dữ liệu nguồn, fixture và public là một phần của cấu hình build và các script.

[Frontend](../../frontend/README.md) · [Backend](../../backend/README.md) · [Packages](../../packages/README.md)
