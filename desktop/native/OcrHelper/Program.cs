using System.Text.Json;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public static async Task<int> Main(string[] args)
    {
        try
        {
            if (args.Length < 1 || string.IsNullOrWhiteSpace(args[0]))
            {
                throw new ArgumentException("Image path is required.");
            }

            var imagePath = Path.GetFullPath(args[0]);
            if (!File.Exists(imagePath))
            {
                throw new FileNotFoundException("Capture image was not found.", imagePath);
            }

            var requestedLanguage = args.Length > 1 ? args[1]?.Trim() : string.Empty;

            var file = await StorageFile.GetFileFromPathAsync(imagePath);
            await using var fileStream = await file.OpenStreamForReadAsync();
            using var randomAccessStream = fileStream.AsRandomAccessStream();
            var decoder = await BitmapDecoder.CreateAsync(randomAccessStream);

            var transform = BuildScaleTransform(decoder.PixelWidth, decoder.PixelHeight);
            var bitmap = await decoder.GetSoftwareBitmapAsync(
                BitmapPixelFormat.Bgra8,
                BitmapAlphaMode.Premultiplied,
                transform,
                ExifOrientationMode.RespectExifOrientation,
                ColorManagementMode.ColorManageToSRgb
            );

            using (bitmap)
            {
                var recognition = await OcrAutoDetector.RecognizeAsync(bitmap, requestedLanguage);
                var result = recognition.Result;
                var lines = result.Lines.Select(line => new
                {
                    text = line.Text,
                    words = line.Words.Select(word => new
                    {
                        text = word.Text,
                        x = word.BoundingRect.X,
                        y = word.BoundingRect.Y,
                        width = word.BoundingRect.Width,
                        height = word.BoundingRect.Height
                    }).ToArray()
                }).ToArray();

                var payload = new
                {
                    ok = true,
                    text = recognition.Text,
                    language = recognition.Engine.RecognizerLanguage.LanguageTag,
                    detection = recognition.Detection,
                    sourceWidth = decoder.PixelWidth,
                    sourceHeight = decoder.PixelHeight,
                    processedWidth = bitmap.PixelWidth,
                    processedHeight = bitmap.PixelHeight,
                    lines
                };

                Console.OutputEncoding = System.Text.Encoding.UTF8;
                Console.WriteLine(JsonSerializer.Serialize(payload, JsonOptions));
                return 0;
            }
        }
        catch (Exception exception)
        {
            var payload = new
            {
                ok = false,
                error = exception.Message,
                type = exception.GetType().Name
            };
            Console.Error.WriteLine(JsonSerializer.Serialize(payload, JsonOptions));
            return 1;
        }
    }

    private static BitmapTransform BuildScaleTransform(uint width, uint height)
    {
        var transform = new BitmapTransform();
        var maxDimension = (double)OcrEngine.MaxImageDimension;
        var largest = Math.Max(width, height);
        if (largest <= maxDimension)
        {
            return transform;
        }

        var scale = maxDimension / largest;
        transform.ScaledWidth = Math.Max(1u, (uint)Math.Round(width * scale));
        transform.ScaledHeight = Math.Max(1u, (uint)Math.Round(height * scale));
        transform.InterpolationMode = BitmapInterpolationMode.Fant;
        return transform;
    }

}
