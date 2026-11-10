!macro customInit
  ; Older updaters pass --updated even when they do not pass /S.
  ${If} ${isUpdated}
    SetSilent silent
  ${EndIf}
!macroend
