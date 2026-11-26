// Raw mouse input (unadjustedMovement) makes Chrome ignore software-generated movement, so OPT's injected
// mouse can't turn the camera. Drop that one option; everything else about the lock is unchanged.
;(() => {
  const Original = Element.prototype.requestPointerLock
  if (!Original || Original.__Opt) return
  const Patched = function (Options) {
    if (Options && typeof Options === 'object' && 'unadjustedMovement' in Options) {
      const { unadjustedMovement, ...Rest } = Options
      return Original.call(this, Object.keys(Rest).length ? Rest : undefined)
    }
    return Original.call(this, Options)
  }
  Patched.__Opt = true
  Element.prototype.requestPointerLock = Patched
})()
