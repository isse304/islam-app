# First get Firebase token
Write-Host "Getting Firebase token..."

# Firebase Web API Key
$apiKey = "AIzaSyDhBAdoRQx-vc6lz_5lrZgXVPWXEtam-PQ"

# Sign in to Firebase
$authBody = @{
    email = "lulcare42@gmail.com"
    password = "Naruto73203"
    returnSecureToken = $true
} | ConvertTo-Json

$authResponse = Invoke-RestMethod `
    -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$apiKey" `
    -Method Post `
    -ContentType "application/json" `
    -Body $authBody

Write-Host "Auth response received"

if (-not $authResponse.idToken) {
    Write-Error "No token received"
    exit
}

# Test dua insights endpoint
Write-Host "`nTesting dua insights endpoint..."
$duaBody = @{
    dua = @{
        id = 1
        arabic = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
        translation = "In the name of Allah, the Most Gracious, the Most Merciful"
        reference = "Quran 1:1"
    }
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $($authResponse.idToken)"
}

try {
    $insightsResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/ai/dua/insights" `
        -Method Post `
        -Headers $headers `
        -Body $duaBody

    Write-Host "`nDua Insights Response:"
    $insightsResponse | ConvertTo-Json -Depth 10
} catch {
    Write-Host "`nError Response:"
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)"
    Write-Host "Status Description: $($_.Exception.Response.StatusDescription)"
    
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $reader.BaseStream.Position = 0
    $reader.DiscardBufferedData()
    $responseBody = $reader.ReadToEnd()
    Write-Host "Response Body: $responseBody"
} 