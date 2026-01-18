# Obsolete Files

This document lists files that are no longer needed after the multi-profile login system integration.

## Files to Consider for Removal

### 1. `sceltaprofilo.js`
**Status:** Obsolete  
**Reason:** This was a standalone prototype file for profile selection functionality. The functionality has been fully integrated into `web/index.html` with:
- Better styling (card-based UI matching the app design)
- Proper API endpoint usage (uses `API_BASE_URL` variable)
- Security improvements (sessionStorage for credentials)
- Integration with existing app state and routing

**Action:** Can be safely deleted

### 2. `index.html` (root directory)
**Status:** Stub/Incomplete  
**Reason:** This is just a 37-line stub file with skeleton functions. The actual application is in `web/index.html` (1955+ lines) which has:
- Complete UI implementation
- All features and functionality
- Proper styling and components
- Multi-profile login integration

**Options:**
- Delete it if not needed
- Replace it with a redirect to `web/index.html`
- Update it to match the problem statement requirements if it was meant to be a different implementation

## Main Implementation Files

The complete, working multi-profile login system is implemented in:
- **Backend:** `server.py` (with `/login-v2` route)
- **Frontend:** `web/index.html` (with `performArgoSync()`, `showProfileSelectionModal()`, `selectProfile()`)
- **Helper:** `extended_server.py` (simplified wrapper for backward compatibility)

## Migration Notes

If you were using `sceltaprofilo.js` or the root `index.html`, please update your references to use `web/index.html` instead, which has all the same functionality plus more.
