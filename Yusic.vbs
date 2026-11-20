Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
electronExe = appDir & "\node_modules\electron\dist\electron.exe"
If fso.FileExists(electronExe) Then
  shell.CurrentDirectory = appDir
  shell.Run """" & electronExe & """ """ & appDir & """", 0, False
Else
  shell.Run """" & appDir & "\Yusic.bat""", 0, False
End If
