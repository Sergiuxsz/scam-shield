# Speaks text with the Windows Romanian voice (e.g. "Microsoft Andrei") and writes the WAV as base64 to stdout.
# Electron's built-in speech only sees the older desktop voices; the Romanian voice is a modern (OneCore) one,
# so the app asks Windows for it directly through the WinRT speech API. Text arrives on stdin (UTF-8), never on the command line.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$text = [Console]::In.ReadToEnd()
if (-not $text.Trim()) { exit 3 }

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Wait-Op($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $null = $task.Wait(-1)
  $task.Result
}

# A female Romanian voice if one is installed; Windows itself ships only "Andrei" (male).
$ro = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -like 'ro*' }
$voice = ($ro | Where-Object { $_.Gender -eq [Windows.Media.SpeechSynthesis.VoiceGender]::Female } | Select-Object -First 1)
if (-not $voice) { $voice = $ro | Select-Object -First 1 }
if (-not $voice) { [Console]::Error.Write('no-romanian-voice'); exit 2 }

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$synth.Voice = $voice
$synth.Options.SpeakingRate = 0.9

$stream = Wait-Op ($synth.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$size = [uint32]$stream.Size
$reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
$null = Wait-Op ($reader.LoadAsync($size)) ([uint32])
$bytes = New-Object byte[] $size
$reader.ReadBytes($bytes)
# "<voice name>|<gender>|<base64 WAV>"
[Console]::Out.Write($voice.DisplayName + '|' + $voice.Gender + '|' + [Convert]::ToBase64String($bytes))
