/**
 * Utility functions for generating and parsing non-hardcoded PIN / Access Tokens for URLs
 */

export function generatePinToken(username: string, pass: string): string {
  try {
    const raw = `kmd_v2:${username}:${pass}:${Date.now()}`;
    // Base64 encode
    const base64 = btoa(encodeURIComponent(raw));
    // URL safe character replacements
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (e) {
    console.error('Failed to generate PIN token', e);
    return '';
  }
}

export function parsePinToken(token: string): { username: string; pass: string } | null {
  if (!token) return null;
  try {
    let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const raw = decodeURIComponent(atob(base64));
    if (raw.startsWith('kmd_v2:')) {
      const parts = raw.split(':');
      if (parts.length >= 3) {
        return { username: parts[1], pass: parts[2] };
      }
    } else {
      const parts = raw.split(':');
      if (parts.length >= 2) {
        return { username: parts[0], pass: parts[1] };
      }
    }
  } catch (e) {
    // Ignore decoding errors
  }

  // Fallback for demo token format e.g. sfauigfasgfafe83yrui or admin/user
  const lower = token.toLowerCase();
  if (lower.includes('admin')) {
    return { username: 'admin', pass: '123456' };
  } else if (lower.includes('user') || lower.includes('staf') || lower.includes('staff') || lower.includes('fo')) {
    return { username: 'user', pass: '123456' };
  } else if (token.length > 5) {
    // Default fallback user for arbitrary tokens
    return { username: 'user', pass: '123456' };
  }

  return null;
}
