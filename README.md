# InputBridge Extension

AI overlay cho các ô nhập trên web: detect input, hiện icon nhỏ, live preview, dịch/sửa/làm rõ câu, auto-replace và cấu hình theo site.

## Cách load vào Chrome / Brave

1. Mở `chrome://extensions` hoặc `brave://extensions`.
2. Bật **Developer mode**.
3. Bấm **Load unpacked**.
4. Chọn thư mục này:

```txt
F:\All Project\_Đang build\InputBridge Extension
```

## Test nhanh

Mặc định extension dùng Google Translate web endpoint và **Demo mode đang tắt**, nên chưa cần OpenAI API key vẫn dịch được.

Muốn test bằng file `demo.html`:

1. Vào trang quản lý extension.
2. Mở chi tiết InputBridge.
3. Bật **Allow access to file URLs**.
4. Mở `demo.html` trong browser.

Hoặc test luôn trên web bình thường như Gmail, Messenger web, Discord web, Slack web, textarea bất kỳ.

## Mode hiện có

- `Translate`: chuyển text sang target language.
- `Improve`: làm câu tự nhiên hơn.
- `Clarify`: làm ý rõ hơn.
- `Fix grammar`, `Make shorter/longer`, `More formal/casual` trong tab Write.

## Auto behavior

- `Preview only`: chỉ hiện preview, bấm Apply hoặc Tab để nhận.
- `Auto replace sau khi ngừng gõ`: tự thay nội dung sau khi user dừng gõ.
- `Auto on Send thử nghiệm`: bắt Enter, đổi câu rồi thử click nút gửi gần nhất. Cái này chưa thể đảm bảo 100% vì mỗi web xử lý send khác nhau.

## Dịch văn bản được bôi đen

Mặc định:

```txt
Bôi đen text
→ icon glass `A文` xuất hiện gần selection
→ bấm icon
→ card dịch mở ra
→ copy hoặc đóng
```

Trong popup có thể đổi sang `Instant after selection`, lúc đó extension chờ khoảng 320 ms rồi tự dịch, không cần bấm icon.

Logic bảo vệ hiện tại:

- Chỉ nhận selection có chữ cái hoặc chữ số Unicode.
- Mặc định tối thiểu 2 và tối đa 1.000 ký tự, có thể chỉnh trong popup.
- Không kích hoạt trong ô nhập/editor trừ khi bật `Allow inside editable fields`.
- Dùng Google Translate riêng cho selection, không gọi AI enhance và không dịch ngược.
- Hủy request cũ khi selection thay đổi.
- Hỗ trợ document thường, iframe và open Shadow DOM.
- Icon/card tự biến mất khi click nơi khác, nhấn Esc hoặc selection cuộn ra khỏi viewport.

## Phím tắt

- `Tab`: nhận preview nếu bật trong popup.
- `Esc`: đóng preview.
- `Ctrl+Z`: hoàn tác lần thay gần nhất của InputBridge.
- `Alt+J`: toggle bật/tắt InputBridge cho site hiện tại.

## Dùng AI thật

### 9Router local

1. Bấm icon InputBridge trên thanh extension.
2. Tắt **Demo mode**.
3. Chạy 9Router local (endpoint mặc định: `http://localhost:20128/v1`).
4. Trong **AI provider**, giữ `9Router (local)` và model `mmf/mimo-auto`.
5. Bật **AI enhance** rồi Save. Không cần API key cho cấu hình local này.

### Gemini direct

1. Chọn `Gemini direct`.
2. Dán Gemini API key lấy từ Google AI Studio.
3. Chọn model gợi ý, mặc định là `gemini-3.5-flash`.
4. Bật **AI enhance** rồi Save.

Các model Gemini có sẵn trong gợi ý: `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-3.1-pro-preview`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`.

Nếu chọn `OpenAI direct` hoặc `Gemini direct`, API key vẫn được lưu bằng `chrome.storage.sync`. Bản production nên chuyển sang backend riêng hoặc mã hóa/local vault, đừng để user/team dùng key thô nếu phát hành rộng.

## Privacy guard hiện tại

Extension bỏ qua các input type nhạy cảm/có rủi ro:

- password
- email
- tel
- number
- url
- date/time
- file
- checkbox/radio/button/hidden

Bản sau nên thêm blacklist domain như banking, payment, admin nội bộ, incognito guard, và site permission tối thiểu.

## Input detection engine

Bản `0.2.x` không còn phụ thuộc vào selector riêng của từng website. Engine hiện xử lý theo lớp:

```txt
Top document
├─ mọi iframe phù hợp quyền truy cập
├─ open Shadow DOM, kể cả shadow lồng nhau
├─ editor được tạo động sau khi trang load
└─ adapter theo capability
   ├─ input / textarea
   ├─ value-based textbox
   └─ contenteditable / role=textbox / Lexical / ProseMirror / Slate / Quill
```

`shadow-hook.js` chạy ở `document_start` trong MAIN world để báo cho content layer ngay khi trang tạo ShadowRoot mới. Mỗi document và ShadowRoot có listener cùng MutationObserver riêng, nhưng một event chỉ được xử lý ở root sâu nhất để tránh gọi dịch trùng.

Giới hạn còn lại là **closed Shadow DOM**: extension phát hiện được host được tạo nhưng không thể đọc node bên trong mà không ép trang đổi cơ chế encapsulation. Không nên force-open mặc định vì có thể phá website. Site adapter chỉ nên dùng cho closed shadow hoặc send flow quá đặc thù.

## File chính

```txt
manifest.json   Chrome Manifest V3 + frame/shadow injection
shadow-hook.js  phát hiện ShadowRoot động trong MAIN world
background.js   settings + Google Translate + optional LLM
content.js      frame agent + shadow scanner + editor adapters + typing/selection overlay
content.css     style overlay
popup.html      config UI
popup.js        save/load setting
popup.css       style popup
demo.html       trang test local
```

## Việc nên làm tiếp

1. Thêm phát âm và dictionary detail cho selection một từ.
2. Thêm diagnostic panel không ghi nội dung người dùng.
3. Viết adapter nhỏ chỉ cho send flow quá đặc thù.
4. Thêm glossary cá nhân.
5. Thêm per-site default mode/tone/language.
6. Làm backend proxy để giấu API key.
7. Thêm back-translation tốt hơn và warning khi câu có thể bị hiểu sai.
