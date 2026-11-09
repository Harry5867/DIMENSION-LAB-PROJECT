# Portal sau đăng nhập

## Welcome preferences

The homepage footer contains System / Light / Dark appearance controls and an English / Tiếng Việt selector. ThemeProvider owns one shared `dimension-lab:theme` preference for Welcome, Sign in, Workspace, Theory, About us, User Guide, Datasets and Model, including its dialogs and 3D background. It migrates the old Welcome choice before the formerly forced-light Model value. System follows OS appearance changes; explicit light/dark choices persist through navigation, refresh and sign out. Interior pages have a compact theme toggle beside their existing navigation. Language remains scoped to Welcome and Sign in and is stored separately; the document language is restored on leaving Welcome.

Atlas / Terrain / Stories controls are portaled into the homepage header, aligned with the numbered concepts on desktop. Compact layouts wrap the header controls into rows. Mode buttons use a short underline reveal and color change, without the shared liquid pointer effect. Globe state and its renderer stay mounted during mode changes.

Terrain and Stories replace the homepage introduction with mode-specific text and inline controls in the left column (`welcome-exploration.css`). All three modes share Atlas's hero height, column proportions, typography, copy padding and responsive breakpoint. The globe keeps the right column. The CTA stays outside the scrolling details. Story filters remain visible while selected-story content scrolls separately; the whole controls area can scroll in short windows. At widths up to 599px, the order is introduction, globe, controls, CTA; details expand in the page flow, and the globe uses the same height as Atlas. Selecting a terrain sample reveals its source reading; story selection reveals the detail and returns focus on close. Mode changes reuse the same globe renderer, rotation, zoom and terrain settings. Source values, terrain geometry, source attribution and demo disclosures are unchanged. Reduced motion disables the short intro reveals.

The Workspace header appears only on the five-card overview. Theory, About us, User Guide and Datasets open without that header or the five-section navigation strip; their local titles and return links provide navigation. Model retains its own existing header and Go back control.

Terrain and Stories use single-line titles. The longer Vietnamese Stories title scales to the available column width. Terrain uses the requested `POPULATION / 2026` interface-edition label. The source attribution explicitly shows `WorldPop / CIESIN · 2020`; source metadata, readings and sampling notes retain the actual dataset year.

Trang Welcome và quả cầu được giữ nguyên. Sau đăng nhập demo, `Entry` mở `#/overview` với năm thẻ chọn mục. CSS nằm trong `src/components/portal.css`, giới hạn bằng các class `portal-*`.

| Mục | Route | Nội dung |
| --- | --- | --- |
| Theory | `#/theory` | Bốn quyển kiến thức, input/output và minh hoạ cho tám thuật toán |
| Model | `#/explore` | Workspace đang có; giữ các route datasets/methods/experiments |
| About us | `#/about` | Mục tiêu dự án; thông tin nhóm chờ bổ sung |
| User Guide | `#/guide` | Quy trình thực hành, dashboard, 3D và xuất dữ liệu |
| Datasets | `#/library` | Biểu đồ PCA/GMM tính sẵn từ hai CSV của dự án |

`library` khác `datasets`: trang đầu là thư viện kết quả mẫu, trang sau quản lý dữ liệu trong Model. Nút từ thư viện mở trình quản lý; người dùng chọn dữ liệu và cấu hình phân tích tại đó.

## Theory collection

`Theory.tsx` renders four CSS book covers: Reduction (PCA, t-SNE, UMAP), Clustering (K-Means, DBSCAN, GMM), Anomaly Detection (Isolation Forest), and Association Rules (Apriori). Hover and keyboard focus bring a cover forward; a stationary wrapper keeps the hover target stable as the cover moves. Mobile uses a two-column collection without overlapping covers. Reduced motion removes the transitions.

Native links open readers such as `#/theory?chapter=clustering&method=gmm`. `theorySelection` validates chapter/method pairs and falls back to the first method in a valid chapter. Browser Back/Forward, direct links and modified link clicks remain available. Readers contain input/output, process steps, original SVG illustrations, project-specific parameters, interpretation, limitations and links to primary references. Diagrams are labeled conceptual; the six-transaction Apriori example is checked against the actual algorithm in tests. Open Model links to the existing methods screen without silently changing a user's experiment settings. Theory CSS is scoped through `portal-page--theory` and `theory-*` classes.

Workspace chỉ được tải khi mở Model lần đầu. Khi rời Model, trạng thái kết quả trong React được giữ, WebGL ngừng render, các tác vụ chưa xong, live preview và story timers bị hủy. Dashboard/modal đóng; kiểm tra trạng thái server định kỳ dừng. Đăng xuất unmount workspace. Trạng thái Model không được giữ qua refresh hoặc đăng xuất.

Các trang nội dung mới không dùng WebGL, thư viện animation hay ThreeUI. Trang chọn mục dùng `WorkspaceCarousel.tsx` và `workspace-carousel.css`: năm thẻ trên quỹ đạo ellipse, kéo ngang để xoay, hoặc dùng hai nút mũi tên. Bấm thẻ mở thẳng route, không có bước xem trước hoặc nút Open Model. Nhãn Workspace nằm ở header; tiêu đề lớn được thay bằng dữ liệu biến hình như mô tả bên dưới.

## Workspace algorithm preview

`WorkspaceDataMorph.tsx` replaces the visible left-hand heading with a continuously morphing point cloud. The heading remains available to screen readers. Eight conceptual scenes cover PCA, t-SNE, UMAP, K-Means, GMM, DBSCAN, Isolation Forest and Apriori; its accessible figure description identifies the data as illustrative. There is no visible caption or playback control. No analysis runs, source datasets or Model settings are read or modified.

`src/visuals/dataMorph.ts` contains seeded shapes, palettes, responsive budgets and a delta-time playback clock. Each scene lasts 5.2 seconds, including a 1.8-second transition to the next; point identity and color interpolation persist through the loop. Breathing amplitude is .05, with a slow .075 world-unit vertical bob and phased local motion. `dataMorphRuntime.ts` lazily reuses the existing Three.js vendor chunk. Vertex interpolation runs in a single point draw call; the association scene adds a bounded line graph. Buffers are reused across cycles and disposed on responsive count changes or unmount. A Canvas 2D fallback uses the same shapes if WebGL cannot initialize.

The illustration uses an expanded desktop stage and balances each scene's display scale while preserving its relative coordinates. Camera framing fits every scene across the full rotation/breathing/bobbing range and updates only on resize. Point budgets are 4,800 on desktop, 2,400 in compact viewports and 1,600 on low-power devices, with a 1,000-point Canvas 2D fallback. The denser preview keeps the existing single GPU point draw call and resolution cap. Association edges use the same display scale as their nodes. The responsive framing regression test projects the full desktop point budget at several aspect ratios and orientations to prevent edge clipping.

The scoped `workspace-data-morph.css` keeps the illustration beside the cards on desktop and above them on mobile. The ground grid and entire caption/playback strip are removed in both themes. The data automatically morphs while the Workspace is active. Reduced motion uses gentler timing without pointer parallax. A layout effect stops its single RAF before the first painted frame of a section-opening or sign-out transition; hidden-tab, offscreen and page-hide events also suspend it without catching up on resume. Unmount disconnects observers, listeners and GPU resources. Theme changes recolor existing point buffers in place without restarting the timeline. `tests/dataMorph.test.ts` checks loop continuity, budgets, framing, reduced autoplay, navigation suspension and cleanup.

The five carousel cards display their title, a custom `WorkspaceSectionIcon.tsx` SVG illustration, and a compact footer with ordinal and navigation arrow. The former card descriptions are removed from this overview; section-page introductions still use their existing descriptions. The icons depict an illustrated book, clustered coordinates, team members, a guide path and stacked datasets. Short CSS interactions animate their internal SVG groups without changing card transforms or hit areas. Reduced motion leaves the icons static. Existing number/title selectors remain available to the shared section-opening transition.

Vòng thẻ dùng translate3d; requestAnimationFrame chỉ chạy khi cần cập nhật chuyển động. ResizeObserver đo vùng chứa, còn từng khung hình chỉ cập nhật transform và thứ tự lớp, không render lại React hoặc đổi left/top. Bản thử quán tính: tốc độ rê chuột trái/phải tạo vận tốc góc; rê nhanh tạo đà lớn, sau đó ma sát hàm mũ làm vòng thẻ chậm dần và tự dừng. Không tiếp tục nhận lực khi chuột đứng yên, không xoay theo vị trí mép và không tự dừng khi hover lên thẻ. Rời vùng thẻ vẫn tiếp tục giảm tốc. Không thêm nút dừng hoặc thao tác dừng riêng.

Kéo vẫn bám theo tay, rồi nhận đà từ vận tốc cuối khi thả; không ép về nấc 72°. Hai nút mũi tên và bàn phím giữ điều hướng từng mục. Reduced motion rút ngắn quãng giảm tốc của chuyển động do người dùng khởi tạo. Mất focus khi đang kéo hoặc ẩn tab sẽ dọn trạng thái tương tác.

Kéo vượt 8px chặn click phát sinh sau khi thả; thao tác vuốt dọc trên điện thoại được dành cho cuộn trang. Bàn phím hỗ trợ Tab, Left/Right, Home/End và Enter. Khi rời trang, animation và observer được dọn dẹp. Tên mục đặt trên đầu thẻ để luôn đọc được khi nằm phía sau; thẻ trước có viền xanh, hover có gạch chân tên và mũi tên dịch nhẹ.

## Kết quả mẫu

Chạy `node --import tsx scripts/generate-case-studies.ts` từ thư mục dự án để tạo lại `src/data/case-studies.json`. Script dùng parser, chuẩn hóa Z-score, PCA ba thành phần và GMM diagonal của dự án với seed 42. Biểu đồ scatter chỉ vẽ hai thành phần đầu. Wisconsin dùng 30 đặc trưng; Wholesale chỉ dùng sáu cột chi tiêu, loại Channel và Region. Hash SHA-256 ghi nhận đúng CSV nguồn.

`npm test` kiểm tra routing và đối chiếu các kết quả mẫu với phép tính lại từ CSV. `npm run build` kiểm tra TypeScript và bản build Vite.

Đăng nhập vẫn là demo giao diện đang có, không phải xác thực tài khoản phía server. Không có tên thành viên hoặc vai trò giả lập; cập nhật phần About trong `PortalContent.tsx` khi nhóm cung cấp thông tin.
