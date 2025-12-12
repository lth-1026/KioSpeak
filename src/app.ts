import { StoreProfileModule } from './modules/store_profile/StoreProfileModule';
import { CartManager } from './modules/core/CartManager';
import { KioskUI } from './ui/KioskUI';
import './ui/kiosk.css';

async function main() {
  console.log('🍔 KioSpeak Kiosk initializing...');

  // 1. Initialize Modules
  const storeProfile = new StoreProfileModule();
  // In a real app, you might want to wait for storeProfile.initialize() here, 
  // but KioskUI.init() handles it.

  const cartManager = new CartManager(storeProfile);

  // 2. Initialize UI
  const ui = new KioskUI('app', storeProfile, cartManager);

  // 3. Expose to window for inline event handlers
  (window as any).kioskUI = ui;

  try {
    await ui.init();

    // For testing/debugging:
    (window as any).cartManager = cartManager;
    console.log('✅ Kiosk Ready');

  } catch (e) {
    console.error('Failed to initialize kiosk:', e);
    document.body.innerHTML = `<div style="padding:2rem; color:red">Error: ${(e as Error).message}</div>`;
  }
}

main();
