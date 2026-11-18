# Báo cáo k6 cục bộ

> Runner tự thêm một dòng cho mỗi profile. CPU/RAM là số đo toàn máy; dữ liệu test dùng backend demo cục bộ.

| Thời gian (Bangkok) | Profile | Trạng thái | Ngưỡng CPU/RAM | Thời lượng | VUs tối đa | Iterations | HTTP requests | Checks đạt | Journey thành công | HTTP lỗi | HTTP p95 | Journey p95 | CPU start/max | RAM start/max | Ghi chú |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 2026-11-18 11:45:14 | load | STOPPED | 70% / 72% | 3.7 s | — | — | — | — | — | — | — | — | 14% / 75% | 55% / 55% | resource guard reached CPU 75% / RAM 55% |
| 2026-11-18 11:46:04 | load | STOPPED | 70% / 72% | 72.1 s | — | — | — | — | — | — | — | — | 13% / 95% | 55% / 55% | resource guard reached CPU 95% / RAM 55% |
| 2026-11-18 11:52:02 | load | STOPPED | 73% / 74% | 3.5 s | — | — | — | — | — | — | — | — | 22% / 84% | 62% / 62% | resource guard reached CPU 84% / RAM 62% |
| 2026-11-18 11:53:21 | load | STOPPED | 73% / 74% | 6.6 s | — | — | — | — | — | — | — | — | 11% / 91% | 54% / 54% | resource guard reached CPU 91% / RAM 54% |
| 2026-11-18 11:55:03 | load | STOPPED | 73% / 74% | 76.7 s | — | — | — | — | — | — | — | — | 30% / 87% | 49% / 50% | resource guard reached CPU 87% / RAM 49% |
| 2026-11-18 11:58:37 | stress | STOPPED | 73% / 74% | 57.1 s | — | — | — | — | — | — | — | — | 12% / 92% | 50% / 50% | resource guard reached CPU 92% / RAM 50% |
| 2026-11-18 12:06:10 | load-lite | PASSED | 73% / 74% | 77.5 s | — | — | — | — | — | — | — | — | 9% / 69% | 58% / 59% | Previous runner recorded status but did not capture k6 metrics; rerun to populate them |
| 2026-11-18 12:16:23 | load-lite | STOPPED | 73% / 74% | 1.5 s | — | — | — | — | — | — | — | — | 39% / 81% | 55% / 55% | resource guard reached CPU 81% / RAM 55%; k6 exited with code 1; No readable k6 summary or streamed metric points were available |
| 2026-11-18 12:16:37 | load-lite | PASSED | 73% / 74% | 77.5 s | 2 | 104 | 832 | 936/936 | 100.00% | 0.00% | 3.81 ms | 26.00 ms | 13% / 52% | 55% / 55% | Metrics aggregated from live JSON points; p95 uses nearest-rank estimate |
| 2026-11-18 12:26:02 | load | STOPPED | 73% / 74% | 1.4 s | — | — | — | — | — | — | — | — | 48% / 87% | 44% / 44% | resource guard reached CPU 87% / RAM 44%; k6 exited with code 1; No readable k6 summary or streamed metric points were available |
| 2026-11-18 12:26:28 | spike | PASSED | 73% / 74% | 76.3 s | 4 | 154 | 1232 | 1386/1386 | 100.00% | 0.00% | 3.75 ms | 27.00 ms | 9% / 41% | 44% / 44% | Metrics aggregated from live JSON points; p95 uses nearest-rank estimate |
| 2026-11-18 12:29:41 | stress | PASSED | 73% / 74% | 92.7 s | 8 | 334 | 2672 | 3006/3006 | 100.00% | 0.00% | 3.22 ms | 25.00 ms | 9% / 38% | 43% / 44% | Metrics aggregated from live JSON points; p95 uses nearest-rank estimate |
| 2026-11-18 12:36:20 | stress | PASSED | 73% / 74% | 92.8 s | 8 | 334 | 2672 | 3006/3006 | 100.00% | 0.00% | 3.39 ms | 25.00 ms | 12% / 69% | 53% / 53% | Metrics aggregated from live JSON points; p95 uses nearest-rank estimate |
| 2026-11-18 12:38:09 | soak | STOPPED | 73% / 74% | 6.5 s | 1 | 4 | 40 | 45/45 | 100.00% | 0.00% | 13.18 ms | 95.00 ms | 9% / 75% | 53% / 54% | resource guard reached CPU 75% / RAM 53%; k6 exited with code 1; Metrics aggregated from live JSON points; p95 uses nearest-rank estimate |
