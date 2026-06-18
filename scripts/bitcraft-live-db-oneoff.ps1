param(
    [Parameter(Mandatory = $true)][string]$TokenFile,
    [Parameter(Mandatory = $true)][string]$HostUrl,
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$OutputFile,
    [int]$TimeoutMs = 60000,
    [int]$RequestId = 1
)

$ErrorActionPreference = "Stop"

function Normalize-WebSocketHost {
    param([Parameter(Mandatory = $true)][string]$Value)
    $normalized = $Value.TrimEnd("/")
    $normalized = $normalized -replace "^https://", "wss://"
    $normalized = $normalized -replace "^http://", "ws://"
    $normalized
}

function Normalize-HttpHost {
    param([Parameter(Mandatory = $true)][string]$Value)
    $normalized = $Value.TrimEnd("/")
    $normalized = $normalized -replace "^wss://", "https://"
    $normalized = $normalized -replace "^ws://", "http://"
    $normalized
}

function Receive-WebSocketText {
    param(
        [Parameter(Mandatory = $true)][System.Net.WebSockets.ClientWebSocket]$WebSocket,
        [int]$TimeoutMs
    )

    $buffer = [byte[]]::new(65536)
    $segment = [ArraySegment[byte]]::new($buffer)
    $stream = [System.IO.MemoryStream]::new()
    $timeout = [Threading.CancellationTokenSource]::new($TimeoutMs)

    try {
        do {
            $result = $WebSocket.ReceiveAsync($segment, $timeout.Token).GetAwaiter().GetResult()
            if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                throw "SpacetimeDB closed the websocket before returning a response."
            }
            $stream.Write($buffer, 0, $result.Count)
        } while (-not $result.EndOfMessage)

        [Text.Encoding]::UTF8.GetString($stream.ToArray())
    }
    finally {
        $stream.Dispose()
        $timeout.Dispose()
    }
}

function Send-WebSocketText {
    param(
        [Parameter(Mandatory = $true)][System.Net.WebSockets.ClientWebSocket]$WebSocket,
        [Parameter(Mandatory = $true)][string]$Text
    )

    $bytes = [Text.Encoding]::UTF8.GetBytes($Text)
    $WebSocket.SendAsync(
        [ArraySegment[byte]]::new($bytes),
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        [Threading.CancellationToken]::None
    ).GetAwaiter().GetResult() | Out-Null
}

$tokenInfo = Get-Content -Raw -Path $TokenFile | ConvertFrom-Json
$token = [string]$tokenInfo.token
if (-not $token) {
    throw "Token file did not contain a token."
}

$httpHost = Normalize-HttpHost -Value $HostUrl
$wsHost = Normalize-WebSocketHost -Value $HostUrl

# The official test path performs this exchange before subscribing. The returned
# token is not used for the v1 JSON subscription, but the preflight keeps this
# helper aligned with the known-good BitCraft SpacetimeDB workflow.
try {
    Invoke-WebRequest `
        -Method Post `
        -Uri "$httpHost/v1/identity/websocket-token" `
        -Headers @{ Authorization = "Bearer $token" } `
        -UseBasicParsing | Out-Null
}
catch {
    # Continue to the subscription attempt; older successful tests did not rely
    # on the websocket-token response as the actual subscription credential.
}

$ws = [System.Net.WebSockets.ClientWebSocket]::new()
$ws.Options.AddSubProtocol("v1.json.spacetimedb")
$ws.Options.SetRequestHeader("Authorization", "Bearer $token")

try {
    $connectTimeout = [Threading.CancellationTokenSource]::new($TimeoutMs)
    $uri = [Uri]"$wsHost/v1/database/$Database/subscribe"
    $ws.ConnectAsync($uri, $connectTimeout.Token).GetAwaiter().GetResult() | Out-Null
    $connectTimeout.Dispose()

    $identityText = Receive-WebSocketText -WebSocket $ws -TimeoutMs $TimeoutMs
    $identity = $identityText | ConvertFrom-Json
    if (-not $identity.IdentityToken) {
        throw "SpacetimeDB did not return an IdentityToken before query."
    }

    $message = @{
        OneOffQuery = @{
            message_id = @(1, 2, 3, $RequestId)
            query_string = $Sql
        }
    } | ConvertTo-Json -Compress -Depth 8

    Send-WebSocketText -WebSocket $ws -Text $message

    do {
        $responseText = Receive-WebSocketText -WebSocket $ws -TimeoutMs $TimeoutMs
        $response = $responseText | ConvertFrom-Json
    } while (-not $response.OneOffQueryResponse)

    $outputDir = Split-Path -Parent $OutputFile
    if ($outputDir) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }
    $responseText | Set-Content -Path $OutputFile -Encoding UTF8
}
finally {
    if ($ws) {
        $ws.Dispose()
    }
}
