# Frontend shared

UI và tiện ích được nhiều feature sử dụng. Providers thiết lập theme và ngôn ngữ. `api/network.ts` quản lý timeout, hủy request và thông báo hết phiên. `api/demoSession.ts` giữ phiên demo. `navigation/portalNavigation.ts` định nghĩa URL hash được dùng bởi Entry và Portal. `styles/` chứa CSS và design tokens toàn cục.

**Kiểm thử:** Chạy `npm test` và kiểm tra chuyển trang, refresh và đổi theme. Giữ storage key và URL hiện có khi chỉnh cấu trúc.

[Frontend](../../README.md)
