$ErrorActionPreference = 'Stop'
$audioDirectory = Join-Path $PSScriptRoot '..\public\audio'
New-Item -ItemType Directory -Path $audioDirectory -Force | Out-Null
$audioPath = [System.IO.Path]::GetFullPath((Join-Path $audioDirectory 'listening-demo.wav'))
$speech = New-Object -ComObject SAPI.SpVoice
$voices = $speech.GetVoices()
for ($voiceIndex = 0; $voiceIndex -lt $voices.Count; $voiceIndex++) {
    $candidateVoice = $voices.Item($voiceIndex)
    if ($candidateVoice.GetDescription() -match 'Zira') { $speech.Voice = $candidateVoice; break }
}
$audioStream = New-Object -ComObject SAPI.SpFileStream
try {
    $audioStream.Open($audioPath, 3, $false)
    $speech.AudioOutputStream = $audioStream
    $speech.Rate = -1
    $speech.Speak("Our school's green fair will be on Friday, the eighteenth of March. Volunteers should meet in the library at eight thirty in the morning. The fair itself starts at nine. Please bring a reusable water bottle. We will provide name badges. Thank you for helping our school become a greener place.") | Out-Null
} finally {
    $audioStream.Close()
}
Get-Item -LiteralPath $audioPath | Select-Object Name, Length
