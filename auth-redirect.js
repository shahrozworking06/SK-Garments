// Email invitations and recovery links may return to the homepage.
if (/(?:^#|&)(?:invite_token|recovery_token|confirmation_token|access_token)=/.test(location.hash)) {
  location.replace('/admin' + location.hash);
}
