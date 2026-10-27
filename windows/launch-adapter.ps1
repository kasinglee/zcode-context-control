$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
try {
    Set-Location -LiteralPath $projectDir
    & 'C:\Program Files\nodejs\node.exe' (Join-Path $projectDir 'scripts\start-zcode.mjs') 2>&1 | Out-File -LiteralPath (Join-Path $projectDir '.local\relaunch.log') -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw '启动失败，请查看 .local\relaunch.log。' }
} catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message, 'ZCode Context Control') | Out-Null
}

