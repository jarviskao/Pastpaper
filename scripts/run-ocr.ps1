# scripts/run-ocr.ps1
# High-performance hardware-accelerated OCR extraction for ICT MC Past Paper images.
# Recognizes questions and options across all years and outputs to data/ocr.json.

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { 
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' 
})[0]

Function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

[Windows.Media.Ocr.OcrEngine, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapTransform, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) {
    Write-Error "Windows Media OCR engine not available on this system."
    exit 1
}

Write-Host "[OCR] Using Windows OCR Engine: $($engine.RecognizerLanguage.DisplayName)"
$baseDir = (Get-Item ".").FullName
$paperDir = Join-Path $baseDir "Paper"
$outputFile = Join-Path $baseDir "data\ocr.json"

$yearDirs = Get-ChildItem -Path $paperDir -Directory | Where-Object { $_.Name -match '^\d{4}$' } | Sort-Object Name -Descending

$ocrDb = @{}
$totalImages = 0
$totalNonEmpty = 0
$totalSw = [System.Diagnostics.Stopwatch]::StartNew()

foreach ($yDir in $yearDirs) {
    $year = $yDir.Name
    $files = Get-ChildItem -Path $yDir.FullName -Filter "*.png" | Sort-Object Name
    $ySw = [System.Diagnostics.Stopwatch]::StartNew()
    $yNonEmpty = 0

    foreach ($f in $files) {
        $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($f.FullName)) ([Windows.Storage.StorageFile])
        $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])

        $origH = $decoder.PixelHeight
        $origW = $decoder.PixelWidth

        # Scale small images up for optimal OCR clarity
        if ($origH -lt 60) {
            $scale = [Math]::Max(2.5, (60.0 / $origH))
            $transform = [Windows.Graphics.Imaging.BitmapTransform]::new()
            $transform.ScaledWidth = [uint32]($origW * $scale)
            $transform.ScaledHeight = [uint32]($origH * $scale)
            $transform.InterpolationMode = [Windows.Graphics.Imaging.BitmapInterpolationMode]::Cubic
            $bitmap = Await ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied, $transform, [Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation, [Windows.Graphics.Imaging.ColorManagementMode]::ColorManageToSRgb)) ([Windows.Graphics.Imaging.SoftwareBitmap])
        } else {
            $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        }

        $ocrResult = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        $recognizedText = ($ocrResult.Text -replace '\s+', ' ').Trim()

        if ($recognizedText.Length -gt 0) {
            $yNonEmpty++
            $totalNonEmpty++
        }
        $totalImages++

        # Parse filename: e.g. 2025_q_01_0.png
        if ($f.Name -match '^(\d{4}_q_\d+)_(\d+)\.png$') {
            $uid = [string]$matches[1]
            $part = [int]$matches[2]

            if (-not $ocrDb.ContainsKey($uid)) {
                $ocrDb[$uid] = @{
                    uid = $uid
                    year = $year
                    question = ""
                    options = @{}
                }
            }

            if ($part -eq 0) {
                $ocrDb[$uid]["question"] = $recognizedText
            } else {
                $optLetter = [string][char](64 + $part) # 1->A, 2->B, 3->C, 4->D
                $ocrDb[$uid]["options"][$optLetter] = $recognizedText
            }
        }
    }
    $ySw.Stop()
    Write-Host "[OCR] $year : $($files.Count) images processed ($yNonEmpty with text) in $([Math]::Round($ySw.Elapsed.TotalSeconds, 1))s"
}

$totalSw.Stop()
Write-Host "[OCR] Complete! $totalImages images in $([Math]::Round($totalSw.Elapsed.TotalSeconds, 1))s. Recognized text in $totalNonEmpty images."

$json = $ocrDb | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($outputFile, $json, [System.Text.Encoding]::UTF8)
Write-Host "[OCR] Saved results to: $outputFile"
