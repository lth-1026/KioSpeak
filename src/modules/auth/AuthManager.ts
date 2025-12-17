export class AuthManager {
  // Default hashed password (sha256 hash of 'admin1234')
  // In a real app, this should be stored securely on the server
  private static DEFAULT_HASH = 'ac9689e2272427085e35b9d3e3e8bed88cb3434828b43b86fc0596cad4c6e270';
  private static STORAGE_KEY = 'kiospeak_admin_auth';

  static async authenticate(password: string): Promise<boolean> {
    let storedHash = localStorage.getItem(this.STORAGE_KEY);
    const inputHash = await this.hashPassword(password);

    // If no key exists, check against default
    if (!storedHash) {
      if (inputHash === this.DEFAULT_HASH) {
        // If it matches default, ensure we sync it to storage
        localStorage.setItem(this.STORAGE_KEY, this.DEFAULT_HASH);
        return true;
      }
      return false;
    }

    return storedHash === inputHash;
  }

  static async changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    if (await this.authenticate(currentPassword)) {
      const newHash = await this.hashPassword(newPassword);
      localStorage.setItem(this.STORAGE_KEY, newHash);
      return true;
    }
    return false;
  }

  static checkAuth(): boolean {
    return sessionStorage.getItem('admin_authenticated') === 'true';
  }

  static login() {
    sessionStorage.setItem('admin_authenticated', 'true');
  }

  static logout() {
    sessionStorage.removeItem('admin_authenticated');
  }

  private static async hashPassword(password: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
