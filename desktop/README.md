# InputBridge Desktop

Ứng dụng Windows chụp một vùng màn hình, nhận dạng chữ bằng Windows OCR và dịch bằng pipeline Google Translate của InputBridge.

## Chạy khi phát triển

Yêu cầu:

- Windows 10 19041 trở lên
- Node.js 20 trở lên
- .NET 8 SDK

```powershell
cd "F:\All Project\_Đang build\InputBridge Extension\desktop"
npm install
npm start
```

## Cách dùng

1. Chọn ngôn ngữ nguồn và ngôn ngữ đích.
2. Dùng `Ctrl + Shift + X` hoặc bấm vào ô **Phím tắt** để ghi một tổ hợp khác.
3. Nhấn phím tắt hoặc nút **Chọn vùng để dịch**.
4. Chọn mode trên thanh top của overlay:
   - **Văn bản**: gom OCR thành bản gốc và bản dịch trong popup.
   - **Trong ảnh**: dịch theo từng dòng, giữ tọa độ và vẽ bản dịch lên ảnh.
5. Kéo chọn sát vùng chữ và chờ kết quả xuất hiện cạnh vùng đã chọn.

Mode cuối cùng được lưu và dùng lại ở lần chụp sau. Kết quả **Trong ảnh** có thể sao chép thẳng vào clipboard dưới dạng PNG.

Nút đỏ chỉ ẩn cửa sổ xuống system tray để global hotkey tiếp tục chạy. Bấm icon InputBridge ở tray để mở lại; chọn **Thoát hẳn** trong menu tray khi muốn tắt app hoàn toàn.

`Esc` hoặc chuột phải sẽ hủy chế độ chọn vùng.

## Auto-detect ngôn ngữ OCR

Khi source language là `Auto detect`, OCR helper chạy tất cả Windows OCR
language pack đang cài, chấm điểm kết quả theo độ đầy đủ, hệ chữ và dấu hiệu
ngôn ngữ, đồng thời so sánh với model Tesseract tiếng Việt chạy local. Ảnh được
nhận là tiếng Việt sẽ dùng model `vie`, vì Windows không cung cấp OCR pack
`vi-VN`.

Muốn nhận dạng được một hệ chữ khác (Nhật, Hàn, Trung, Ả Rập...), máy phải cài
OCR language pack tương ứng trong Windows Settings. Chọn source language thủ
công vẫn chỉ chạy đúng pack được chọn; riêng `Vietnamese` dùng model local đi
kèm app.

## Build bản portable

```powershell
npm run dist
```

File chạy được tạo trong `desktop/dist/`.

## Kiến trúc

- `main.js`: capture, global hotkey, crop ảnh, quản lý cửa sổ và IPC.
- `native/OcrHelper`: helper .NET 8 dùng `Windows.Media.Ocr`.
- `src/translation.js`: Google Translate, cache và chunking tối đa 20.000 ký tự.
- `renderer/`: cửa sổ kính sáng kiểu macOS, cấu hình ngôn ngữ và ghi global hotkey.
- `selection/`: overlay chọn vùng và segmented control chọn mode.
- `result/`: popup text hoặc canvas ảnh dịch giữ bố cục.

## Giới hạn hiện tại

- OCR auto chỉ so sánh các language pack đã cài và chọn một pack cho toàn vùng ảnh; ảnh trộn nhiều hệ chữ chưa được tách theo từng dòng.
- Một số video DRM hoặc game exclusive fullscreen có thể trả ảnh đen. Chuyển sang borderless hoặc windowed mode.
- Bản đầu chưa có chế độ ghim vùng và dịch liên tục.
