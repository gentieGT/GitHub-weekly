' Launch the gh-weekly watchdog with no console window.
'
' Why wscript: powershell.exe -WindowStyle Hidden is ignored when Windows
' Terminal is the default console host, so it flashes a black box. wscript.exe
' is a GUI host and never creates a console at all.
'
' This file resolves the script path relative to itself, so the project can be
' cloned anywhere.

Option Explicit
Dim sh, fso, f, cmd, here, script, logFile

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Location of this .vbs, with trailing backslash removed
here = fso.GetParentFolderName(WScript.ScriptFullName)
script = here & "\watchdog.ps1"
logFile = here & "\watchdog-launch.log"

On Error Resume Next
Set f = fso.OpenTextFile(logFile, 8, True)
If Not f Is Nothing Then
    f.WriteLine Now & "  wscript launcher triggered"
    f.Close
End If
On Error GoTo 0

If Not fso.FileExists(script) Then
    On Error Resume Next
    Set f = fso.OpenTextFile(logFile, 8, True)
    If Not f Is Nothing Then
        f.WriteLine Now & "  ERROR: watchdog.ps1 not found in " & here
        f.Close
    End If
    On Error GoTo 0
    WScript.Quit 1
End If

cmd = "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden " & _
      "-ExecutionPolicy Bypass -File """ & script & """"

' 0 = hidden window, False = do not wait
sh.Run cmd, 0, False
