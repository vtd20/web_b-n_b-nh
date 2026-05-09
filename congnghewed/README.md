# GIFTER BAKERY

Website bánh ngọt gồm frontend tĩnh, backend Express/SQLite, đăng nhập Google, giỏ hàng, đặt đơn và khu admin.

## Tính năng hiện có

- Trang chủ, danh sách sản phẩm, chi tiết sản phẩm và giỏ hàng.
- Đăng ký, đăng nhập, đăng xuất bằng session cookie.
- Đăng nhập Google qua Google Identity Services.
- Tạo đơn hàng lưu vào SQLite.
- Trang quản trị đơn hàng, khách hàng, thống kê và cài đặt.
- Đồng bộ thông báo admin qua Socket.IO và n8n webhook.

## Công nghệ

- HTML5, CSS3, JavaScript vanilla.
- Node.js, Express, `better-sqlite3`.
- `google-auth-library`, `cookie-parser`, `socket.io`.
- SQLite lưu người dùng, session và đơn hàng.

## Cấu trúc thư mục

```text
congnghewed/
├── backend/
│   ├── server.js
│   ├── db.js
│   ├── schema.sql
│   ├── .env.example
│   └── n8n-*.workflow.json
└── frontend/
    ├── *.html
    ├── css/
    ├── js/
    └── img/
```

## Chạy dự án

1. Vào thư mục backend:

```bash
cd backend
```

2. Cài dependency:

```bash
npm install
```

3. Tạo file `.env` từ `.env.example` và chỉnh các biến cần thiết.

4. Chạy server:

```bash
npm start
```

5. Mở `http://localhost:3000`.

## Biến môi trường chính

- `PORT`: cổng chạy server.
- `NODE_ENV`: `development` hoặc `production`.
- `TRUST_PROXY`: bật khi chạy sau reverse proxy / load balancer.
- `COOKIE_SAMESITE`, `COOKIE_SECURE`: cấu hình cookie session.
- `GOOGLE_CLIENT_ID`: bật Google Sign-In.
- `N8N_NOTIFICATION_WEBHOOK_URL`: webhook n8n nhận thông báo đơn hàng.
- `N8N_NOTIFICATION_WEBHOOK_SECRET`: secret tùy chọn cho webhook.
- `SESSION_DAYS`: số ngày sống của session cookie.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: tài khoản admin bootstrap. Khi deploy thật, `ADMIN_PASSWORD` là bắt buộc.
- `FRONTEND_ORIGIN`, `FRONTEND_ORIGINS`: danh sách origin được phép gọi API thay đổi dữ liệu.

## Bảo mật và deploy

- Đặt `NODE_ENV=production` khi deploy.
- Đặt `ADMIN_PASSWORD` mạnh và riêng cho môi trường production.
- Chỉ thêm các origin thực sự cần thiết vào `FRONTEND_ORIGINS`.
- Bật `COOKIE_SECURE=true` khi chạy qua HTTPS.
- Kiểm tra `GET /api/health` sau khi deploy.

## Ghi chú

- Không nên mở file HTML trực tiếp bằng `file://`; hãy chạy qua backend để API hoạt động.
- Dữ liệu sản phẩm hiện đang nằm ở client, chưa chuyển sang API riêng hoàn toàn.
- `data/bakery.sqlite` là file runtime, không cần commit nếu dùng repo cho phát triển.

## Healthcheck

- `GET /api/health` trả về trạng thái deploy cơ bản.
