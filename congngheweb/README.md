# Gifter Bakery

Gifter Bakery là một website bán bánh ngọt gồm frontend HTML/CSS/JavaScript thuần và backend Node.js/Express dùng SQLite để lưu dữ liệu. Dự án có đăng nhập local, đăng nhập Google, giỏ hàng, đặt đơn, trang quản trị và tích hợp thông báo qua n8n/Socket.IO.

## Chức Năng Theo Vai Trò

### User

- Xem trang chủ, danh sách sản phẩm và chi tiết sản phẩm.
- Đăng ký, đăng nhập, đăng xuất bằng session cookie.
- Đăng nhập Google bằng Google Identity Services.
- Thêm sản phẩm vào giỏ hàng, cập nhật số lượng và xóa sản phẩm khỏi giỏ.
- Tạo đơn hàng với thông tin người nhận, địa chỉ, phương thức thanh toán và ghi chú.
- Xem danh sách đơn hàng của mình.
- Hủy đơn khi đơn đang ở trạng thái xử lý.

### Admin

- Đăng nhập với quyền quản trị.
- Truy cập giao diện admin riêng.
- Thêm, sửa, xóa sản phẩm.
- Bật hoặc tắt hiển thị sản phẩm trên frontend.
- Xem toàn bộ đơn hàng.
- Cập nhật trạng thái đơn hàng: `Processing`, `Shipped`, `Delivered`, `Cancelled`.
- Xóa đơn hàng khi cần thiết.
- Xem khu khách hàng, thống kê và cài đặt trong admin.

## Tính Năng Chung

- Đồng bộ thông báo đơn hàng qua Socket.IO và webhook n8n.
- Tự seed dữ liệu sản phẩm ban đầu từ `frontend/js/product-data.js` nếu database còn trống.

## Công Nghệ

- Frontend: HTML5, CSS3, JavaScript vanilla.
- Backend: Node.js, Express.
- Database: SQLite với `better-sqlite3`.
- Xác thực: cookie-parser, session trong SQLite, Google OAuth ID token.
- Thông báo realtime: Socket.IO.

## Cấu Trúc Thư Mục

```text
congnghewed/
├── backend/
│   ├── db.js
│   ├── server.js
│   ├── schema.sql
│   ├── .env.example
│   ├── lib/
│   ├── routes/
│   └── test/
└── frontend/
    ├── index.html
    ├── about.html
    ├── products.html
    ├── product-detail.html
    ├── cart.html
    ├── orders.html
    ├── auth.html
    ├── admin*.html
    ├── css/
    ├── js/
    └── img/
```

## Chạy Dự Án

1. Vào thư mục backend:

```bash
cd backend
```

2. Cài dependency:

```bash
pnpm install
```

3. Tạo file `.env` từ `.env.example` và chỉnh các giá trị cần thiết.

4. Khởi động server:

```bash
pnpm start
```

5. Mở trình duyệt tại:

```text
http://localhost:3000
```

Frontend được phục vụ trực tiếp từ backend, nên không cần mở file HTML bằng `file://`.

## Script

- `pnpm start`: chạy server Express.
- `pnpm test`: chạy bộ test cơ bản trong `test/basic.test.js`.

## API Chính

- `GET /api/health`: kiểm tra trạng thái server.
- `GET /api/public-config`: trả cấu hình công khai cho frontend.
- `GET /api/me`: lấy user hiện tại từ session.
- `POST /api/auth/register`: đăng ký tài khoản local.
- `POST /api/auth/login`: đăng nhập local.
- `POST /api/auth/google`: đăng nhập bằng Google.
- `POST /api/auth/logout`: đăng xuất.
- `GET /api/products`: lấy danh sách sản phẩm.
- `GET /api/products/:slug`: lấy chi tiết sản phẩm.
- `POST /api/products`: tạo sản phẩm, chỉ admin.
- `PATCH /api/products/:slug`: cập nhật sản phẩm, chỉ admin.
- `DELETE /api/products/:slug`: xóa sản phẩm, chỉ admin.
- `GET /api/orders`: lấy danh sách đơn hàng của user hoặc admin.
- `GET /api/orders/:id`: lấy chi tiết đơn hàng.
- `POST /api/orders`: tạo đơn hàng mới.
- `PATCH /api/orders/:id/status`: cập nhật trạng thái đơn, chỉ admin.
- `PATCH /api/orders/:id/cancel`: hủy đơn đang xử lý.
- `DELETE /api/orders/:id`: xóa đơn, chỉ admin.

## Biến Môi Trường

File mẫu: [`backend/.env.example`](backend/.env.example)

- `PORT`: cổng chạy server, mặc định `3000`.
- `NODE_ENV`: `development` hoặc `production`.
- `TRUST_PROXY`: đặt `1` nếu chạy sau reverse proxy.
- `COOKIE_SAMESITE`: cấu hình SameSite cho session cookie.
- `COOKIE_SECURE`: bật `true` khi dùng HTTPS.
- `GOOGLE_CLIENT_ID`: OAuth Client ID cho đăng nhập Google.
- `FRONTEND_ORIGIN`: origin frontend được phép gọi API.
- `FRONTEND_ORIGINS`: danh sách origin, ngăn cách bằng dấu phẩy.
- `N8N_NOTIFICATION_WEBHOOK_URL`: webhook nhận thông báo đơn hàng.
- `N8N_NOTIFICATION_WEBHOOK_SECRET`: secret tùy chọn cho webhook.
- `SESSION_DAYS`: số ngày sống của session.
- `ADMIN_EMAIL`: email tài khoản admin bootstrap.
- `ADMIN_PASSWORD`: mật khẩu admin bootstrap.

## Database

- File SQLite runtime được tạo tại `backend/data/bakery.sqlite`.
- Schema nằm ở [`backend/schema.sql`](backend/schema.sql).
- Khi database còn trống, backend sẽ tự seed sản phẩm từ `frontend/js/product-data.js`.

## Lưu Ý Khi Deploy

- Đặt `NODE_ENV=production`.
- Đặt `ADMIN_PASSWORD` mạnh và riêng cho môi trường production.
- Chỉ thêm những origin thật sự cần thiết vào `FRONTEND_ORIGINS`.
- Bật `COOKIE_SECURE=true` khi chạy qua HTTPS.
- Kiểm tra `GET /api/health` sau khi deploy xong.

## Kiểm Tra

Chạy test:

```bash
npm test
```



## Ghi Chú

- Đây là dự án frontend tĩnh + backend Express, nên server vừa phục vụ HTML vừa cung cấp API.
- Một số dữ liệu sản phẩm ban đầu nằm trong frontend và được backend đọc để seed database.
