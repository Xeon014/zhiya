$ErrorActionPreference = 'Stop'
Set-Location "$PSScriptRoot\..\output\zhiya"
$tmp = Join-Path $env:TEMP 'zhiya-ooxml-check'
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $tmp | Out-Null
foreach ($f in 'docx','xlsx','pptx') {
  $src = "export.$f"
  if (-not (Test-Path $src)) { Write-Output "$f : MISSING export.$f"; continue }
  $dir = Join-Path $tmp $f
  Copy-Item $src "$dir.zip"
  Expand-Archive -Path "$dir.zip" -DestinationPath $dir -Force
  $xmls = Get-ChildItem $dir -Recurse -Filter *.xml
  $bad = 0
  foreach ($x in $xmls) {
    try {
      $content = [System.IO.File]::ReadAllText($x.FullName)
      $doc = New-Object System.Xml.XmlDocument
      $doc.LoadXml($content)
    } catch { $bad++; Write-Output "BAD XML: $f / $($x.Name): $($_.Exception.Message)" }
  }
  if ($bad -eq 0) { Write-Output "$f : $($xmls.Count) 个 XML 全部良构 OK" }
}
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
