// CRITICAL: Proper sign-out that ACTUALLY works
export const signOutCompletely = () => {
  console.log('🔓 SIGNING OUT - Clearing all sessions...');

  // 1. Clear ALL localStorage
  localStorage.clear();
  console.log('✅ localStorage cleared');

  // 2. Clear ALL sessionStorage
  sessionStorage.clear();
  console.log('✅ sessionStorage cleared');

  // 3. Clear ALL cookies
  document.cookie.split(";").forEach((c) => {
    const cookieName = c.split("=")[0].trim();
    document.cookie = `${cookieName}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    document.cookie = `${cookieName}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=${window.location.hostname}`;
  });
  console.log('✅ Cookies cleared');

  // 4. Disable Google One Tap IMMEDIATELY
  try {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
      window.google.accounts.id.cancel();
      console.log('✅ Google One Tap disabled');
    }
  } catch (e) {
    console.log('⚠️ Could not disable Google One Tap:', e);
  }

  // 5. Revoke Google OAuth token if possible
  try {
    const userEmail = localStorage.getItem('userEmail');
    if (userEmail && window.google?.accounts?.id) {
      window.google.accounts.id.revoke(userEmail, (done) => {
        console.log('✅ Google OAuth revoked');
      });
    }
  } catch (e) {
    console.log('⚠️ Could not revoke Google OAuth:', e);
  }

  // 6. Force HARD reload to root (this clears React state)
  console.log('🔄 Forcing hard reload...');

  // Use replace to prevent back button issues
  window.location.replace('/');

  // Backup: force reload if replace doesn't work
  setTimeout(() => {
    window.location.reload();
  }, 100);
};
