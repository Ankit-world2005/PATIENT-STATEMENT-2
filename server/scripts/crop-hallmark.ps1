Add-Type -AssemblyName System.Drawing

$srcPath = "client\src\assets\my-patient-hallmark.png"
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

# Source center and radius
$cx = 510.0
$cy = 514.0
$radius = 383.0

# Target square size
$pad = 6
$diameter = [int]($radius * 2) + ($pad * 2)
$dst = New-Object System.Drawing.Bitmap($diameter, $diameter, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

$dstCx = $diameter / 2.0
$dstCy = $diameter / 2.0

# Antialiasing parameters
$innerR = $radius - 1.0
$outerR = $radius + 1.2

for ($y = 0; $y -lt $diameter; $y++) {
    for ($x = 0; $x -lt $diameter; $x++) {
        $dx = $x - $dstCx
        $dy = $y - $dstCy
        $dist = [Math]::Sqrt($dx * $dx + $dy * $dy)

        if ($dist -gt $outerR) {
            # Outside -> completely transparent
            $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } else {
            # Sample source coordinate
            $srcX = [int]($cx + $dx)
            $srcY = [int]($cy + $dy)

            if ($srcX -ge 0 -and $srcX -lt $src.Width -and $srcY -ge 0 -and $srcY -lt $src.Height) {
                $pixel = $src.GetPixel($srcX, $srcY)

                if ($dist -le $innerR) {
                    # Fully opaque inside hallmark
                    $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $pixel.R, $pixel.G, $pixel.B))
                } else {
                    # Antialiased edge transition
                    $alpha = [int](255.0 * (1.0 - ($dist - $innerR) / ($outerR - $innerR)))
                    if ($alpha -lt 0) { $alpha = 0 }
                    if ($alpha -gt 255) { $alpha = 255 }
                    $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $pixel.R, $pixel.G, $pixel.B))
                }
            } else {
                $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
            }
        }
    }
}

$src.Dispose()

# Save to client/src/assets, client/public, and client/dist
$outSrc = "client\src\assets\my-patient-hallmark.png"
$outPublic = "client\public\my-patient-hallmark.png"
$outDist = "client\dist\my-patient-hallmark.png"

$dst.Save($outSrc, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Save($outPublic, [System.Drawing.Imaging.ImageFormat]::Png)
if (Test-Path "client\dist") {
    $dst.Save($outDist, [System.Drawing.Imaging.ImageFormat]::Png)
}

Write-Output "Successfully generated transparent hallmark: $($diameter)x$($diameter)"
$dst.Dispose()
