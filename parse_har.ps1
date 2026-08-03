$harFiles = @(
    "d:\WeCaht\xwechat_files\wxid_pw1pznjql1eu22_fc1f\msg\file\2026-07\321_1785249769423.har",
    "d:\WeCaht\xwechat_files\wxid_pw1pznjql1eu22_fc1f\msg\file\2026-07\322_1785305577213.har",
    "d:\WeCaht\xwechat_files\wxid_pw1pznjql1eu22_fc1f\msg\file\2026-07\323_1785400854056.har"
)

foreach ($harFile in $harFiles) {
    $fileName = Split-Path $harFile -Leaf
    Write-Host "`n=== $fileName ===" -ForegroundColor Cyan

    if (!(Test-Path $harFile)) {
        Write-Host "  FILE NOT FOUND"
        continue
    }

    $raw = Get-Content $harFile -Raw
    $har = $raw | ConvertFrom-Json
    $entries = $har.log.entries

    Write-Host "  Total entries: $($entries.Count)"

    # Filter for flip/card/raffle/game related URLs
    $flipEntries = $entries | Where-Object {
        $_.request.url -match "flip|card-game|raffle|flipCard|gift"
    }

    Write-Host "  Flip/Card/Raffle entries: $($flipEntries.Count)"

    foreach ($e in $flipEntries) {
        $method = $e.request.method
        $url = $e.request.url
        $status = $e.response.status

        # Truncate URL for display
        $urlDisplay = if ($url.Length -gt 150) { $url.Substring(0, 150) + "..." } else { $url }

        Write-Host "`n  [$method] $urlDisplay" -ForegroundColor Yellow
        Write-Host "    Status: $status"

        # Show request headers
        $reqHeaders = $e.request.headers
        $interestingHeaders = $reqHeaders | Where-Object { $_.name -match "cookie|vid|skey|content-type|authorization" }
        if ($interestingHeaders) {
            foreach ($h in $interestingHeaders) {
                $valDisplay = if ($h.value.Length -gt 100) { $h.value.Substring(0, 100) + "..." } else { $h.value }
                Write-Host "    ReqHeader: $($h.name) = $valDisplay"
            }
        }

        # Show request body if POST
        if ($method -eq "POST" -and $e.request.postData) {
            $bodyDisplay = if ($e.request.postData.text.Length -gt 300) { $e.request.postData.text.Substring(0, 300) + "..." } else { $e.request.postData.text }
            Write-Host "    ReqBody: $bodyDisplay"
        }

        # Show response body
        $respContent = $e.response.content
        if ($respContent.text) {
            $bodyDisplay = if ($respContent.text.Length -gt 500) { $respContent.text.Substring(0, 500) + "..." } else { $respContent.text }
            Write-Host "    RespBody: $bodyDisplay"
        }
    }

    # Also list all unique weread.qq.com URLs (not i.weread)
    $wereadUrls = $entries | Where-Object {
        $_.request.url -match "://weread\.qq\.com" -and $_.request.url -notmatch "i\.weread\.qq\.com"
    } | Select-Object -ExpandProperty request -ExpandProperty url -Unique

    if ($wereadUrls) {
        Write-Host "`n  --- All weread.qq.com (non-i.weread) URLs ---" -ForegroundColor Green
        foreach ($u in $wereadUrls) {
            $urlDisplay = if ($u.Length -gt 150) { $u.Substring(0, 150) + "..." } else { $u }
            Write-Host "    $urlDisplay"
        }
    }
}
